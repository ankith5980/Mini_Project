"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeElement = analyzeElement;
exports.analyzeElements = analyzeElements;
const groq_sdk_1 = __importDefault(require("groq-sdk"));
const dotenv_1 = __importDefault(require("dotenv"));
const scanner_1 = require("./scanner");
dotenv_1.default.config();
const apiKey = process.env.GROQ_API_KEY || '';
const groq = new groq_sdk_1.default({ apiKey });
const delay = (ms) => new Promise(res => setTimeout(res, ms));
async function analyzeElement(element) {
    const prompt = `
You are an expert accessibility engineer. Your task is to analyze an HTML/JSX element within its parent context to determine if it meets WCAG accessibility standards. 
You must output ONLY valid JSON without any markdown code blocks or conversational text.

Context:
Parent Code:
\`\`\`
${element.parentHtml}
\`\`\`

Target Element Code:
\`\`\`
${element.elementHtml}
\`\`\`

Analyze the target element. Does it have sufficient context for screen readers? Does it use semantic HTML properly? Is it missing ARIA attributes where necessary?

Be extremely accurate in your code fix. Ensure the replacement code contains all necessary structural semantics, aria-labels, alt text, and valid roles based on the parent context.
CRITICAL INSTRUCTIONS FOR FIX:
1. Your suggested fix MUST COMPLETELY resolve the accessibility issue. If the fixed element were analyzed again, it MUST pass all WCAG checks.
2. Provide the COMPLETE Target Element in your fix, including its opening tag, all original children, and its closing tag. Do NOT provide partial snippets.
3. The replacement code MUST match the exact framework syntax of the input. If the input uses React JSX syntax (like \`className\`, camelCase attributes, or \`style={{}}\`), the output MUST be valid JSX. If standard HTML, output standard HTML.
4. Maintain all existing non-accessibility attributes (e.g., \`id\`, \`class\`, \`onClick\`, \`href\`, etc.) exactly as they appear in the original Target Element.

Return a JSON object with this exact structure:
{
    "isAccessible": boolean,
    "issueTitle": string (or null if isAccessible is true. A concise title of the WCAG violation),
    "explanation": string (or null. Explain the issue concisely to a developer),
    "suggestedFixCode": string (or null. Provide the highly accurate, complete replacement code for the Target Element that fixes the issue, matching the input's syntax),
    "fixReasoning": string (or null. Briefly explain exactly what the suggested fix code does and how it solves the accessibility issue)
}
`;
    let retries = 3;
    let delayMs = 2000;
    while (retries > 0) {
        try {
            const completion = await groq.chat.completions.create({
                messages: [
                    {
                        role: 'system',
                        content: 'You are an AI that only outputs valid JSON. Do not output anything else.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                model: 'llama-3.3-70b-versatile',
                response_format: { type: 'json_object' }
            });
            const text = completion.choices[0]?.message?.content;
            if (text) {
                const parsed = JSON.parse(text);
                return {
                    ...element,
                    ...parsed
                };
            }
            throw new Error("No text in response");
        }
        catch (error) {
            if (error.status === 503 || error.status === 429 || error.message?.includes('503') || error.message?.includes('429')) {
                console.warn(`[WARN] Rate limited. Retries left: ${retries - 1}. Retrying in ${delayMs}ms...`);
                retries--;
                if (retries === 0) {
                    return {
                        ...element,
                        isAccessible: false,
                        error: "Failed to analyze due to API rate limits."
                    };
                }
                await delay(delayMs);
                delayMs *= 2;
            }
            else {
                return {
                    ...element,
                    isAccessible: false,
                    error: error.message || "Unknown API error"
                };
            }
        }
    }
    return {
        ...element,
        isAccessible: false,
        error: "Exhausted retries"
    };
}
async function analyzeElements(elements) {
    const results = [];
    console.log(`Analyzing ${elements.length} elements using Groq API...`);
    for (let i = 0; i < elements.length; i++) {
        // Log progress
        console.log(`Analyzing element ${i + 1}/${elements.length}: <${elements[i].tagName}>...`);
        const result = await analyzeElement(elements[i]);
        results.push(result);
        // Wait briefly between requests to avoid rate limits
        if (i < elements.length - 1) {
            await delay(1000);
        }
    }
    return results;
}
//# sourceMappingURL=analyzer.js.map