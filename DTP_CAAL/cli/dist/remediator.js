"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.autoFix = autoFix;
const fs_1 = __importDefault(require("fs"));
const glob_1 = require("glob");
const groq_sdk_1 = __importDefault(require("groq-sdk"));
const chalk_1 = __importDefault(require("chalk"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const apiKey = process.env.GROQ_API_KEY || '';
const groq = new groq_sdk_1.default({ apiKey });
const delay = (ms) => new Promise(res => setTimeout(res, ms));
function extractSearchableStrings(html) {
    const strings = [];
    // Extract text content if it's a simple tag (very naive approach)
    const textMatch = html.match(/>([^<]+)</);
    if (textMatch && textMatch[1].trim()) {
        strings.push(textMatch[1].trim());
    }
    // Extract some common attributes
    const classMatch = html.match(/class(?:Name)?=["']([^"']+)["']/);
    if (classMatch)
        strings.push(classMatch[1].split(' ')[0]); // just the first class for simplicity
    const idMatch = html.match(/id=["']([^"']+)["']/);
    if (idMatch)
        strings.push(idMatch[1]);
    const altMatch = html.match(/alt=["']([^"']*)["']/);
    if (altMatch)
        strings.push(altMatch[1]);
    return strings.filter(s => s.length > 2); // only use somewhat meaningful strings
}
async function findProbableSourceFile(srcDir, elementHtml) {
    const searchTerms = extractSearchableStrings(elementHtml);
    if (searchTerms.length === 0)
        return null;
    const files = await (0, glob_1.glob)('**/*.{ts,tsx,js,jsx,html,vue,svelte}', {
        cwd: srcDir,
        ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**'],
        absolute: true
    });
    let bestFile = null;
    let maxScore = 0;
    for (const file of files) {
        const content = fs_1.default.readFileSync(file, 'utf-8');
        let score = 0;
        for (const term of searchTerms) {
            if (content.includes(term)) {
                score++;
            }
        }
        if (score > maxScore) {
            maxScore = score;
            bestFile = file;
        }
    }
    // We only consider it a match if we found at least something relevant
    return maxScore > 0 ? bestFile : null;
}
async function autoFix(results, srcDir) {
    const failedResults = results.filter(r => !r.isAccessible && r.suggestedFixCode);
    if (failedResults.length === 0) {
        console.log(chalk_1.default.green('No automated fixes to apply.'));
        return;
    }
    console.log(chalk_1.default.cyan(`\nAttempting Automated Remediation on ${failedResults.length} issues in ${srcDir}...`));
    for (let i = 0; i < failedResults.length; i++) {
        const result = failedResults[i];
        console.log(chalk_1.default.yellow(`\n[Fix ${i + 1}/${failedResults.length}] Issue: ${result.issueTitle}`));
        const sourceFile = await findProbableSourceFile(srcDir, result.elementHtml);
        if (!sourceFile) {
            console.log(chalk_1.default.red(`  -> Could not locate a probable source file for this element.`));
            continue;
        }
        console.log(chalk_1.default.green(`  -> Probable source file found: ${sourceFile}`));
        const originalContent = fs_1.default.readFileSync(sourceFile, 'utf-8');
        const prompt = `
You are an expert developer. Your task is to apply an accessibility fix to a source code file.
I will give you the complete original source file, and the details of an accessibility issue found in an element that was rendered from this file.

Original Source File:
\`\`\`
${originalContent}
\`\`\`

Rendered Element (HTML) with issue:
\`\`\`
${result.elementHtml}
\`\`\`

Suggested fix for the rendered element:
\`\`\`
${result.suggestedFixCode}
\`\`\`

Your Task:
Find where the "Rendered Element" comes from in the "Original Source File".
Apply the "Suggested fix" logic to the exact component or JSX/HTML code in the file.
Make sure you write valid syntax for the framework (e.g., in React use className instead of class, camelCase for attributes).
Return the ENTIRE updated source file content. DO NOT truncate or omit any unchanged parts. The output must be the complete, ready-to-save file.
DO NOT wrap the response in markdown code blocks. OUTPUT ONLY THE RAW CODE.
`;
        try {
            console.log(chalk_1.default.gray(`  -> Asking LLM to apply fix to source file...`));
            const completion = await groq.chat.completions.create({
                messages: [
                    {
                        role: 'system',
                        content: 'You are an AI code editor. Output ONLY the raw updated source code. Do not include markdown formatting or explanations.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                model: 'llama-3.3-70b-versatile',
            });
            let newContent = completion.choices[0]?.message?.content || '';
            // Just in case it wraps in markdown despite instructions
            if (newContent.startsWith('\`\`\`')) {
                newContent = newContent.replace(/^\`\`\`[a-z]*\n/, '').replace(/\n\`\`\`$/, '');
            }
            if (newContent && newContent !== originalContent) {
                fs_1.default.writeFileSync(sourceFile, newContent);
                console.log(chalk_1.default.green(`  -> Successfully patched ${sourceFile}`));
            }
            else {
                console.log(chalk_1.default.red(`  -> LLM failed to modify the file or returned identical code.`));
            }
        }
        catch (error) {
            console.log(chalk_1.default.red(`  -> Error patching file: ${error.message}`));
        }
        // Wait to avoid rate limits
        await delay(1500);
    }
    console.log(chalk_1.default.cyan(`\nAutomated Remediation completed! Note: Changes are left uncommitted on your file system for you to review manually.`));
}
