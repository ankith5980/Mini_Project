import fs from 'fs';
import path from 'path';
import { AnalysisResult, isIssue, isUnanalysed } from './analyzer';

export function generateJsonReport(results: AnalysisResult[], outputPath: string) {
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`JSON report generated at ${outputPath}`);
}

export function generateMarkdownReport(results: AnalysisResult[], outputPath: string) {
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const failedElements = results.filter(isIssue);
    const unanalysedElements = results.filter(isUnanalysed);
    const cachedCount = results.filter(r => r.cached).length;

    let md = `# Accessibility Audit Report\n\n`;
    md += `**Total Elements Scanned:** ${results.length}\n`;
    md += `**Accessibility Issues Found:** ${failedElements.length}\n`;
    if (unanalysedElements.length > 0) {
        md += `**Elements Not Analyzed (API errors):** ${unanalysedElements.length}\n`;
    }
    md += `**Verdicts Reused From Cache:** ${cachedCount}\n\n`;

    if (failedElements.length === 0) {
        md += unanalysedElements.length === 0
            ? `🎉 Congratulations! No accessibility issues were found.\n`
            : `No accessibility issues were found in the analyzed elements, but the audit is incomplete.\n`;
    } else {
        md += `## Issues Detected\n\n`;
        failedElements.forEach((el, i) => {
            md += `### ${i + 1}. <${el.tagName}>: ${el.issueTitle || 'Issue'}\n\n`;
            md += `**Explanation:** ${el.explanation}\n\n`;

            md += `**Original Code:**\n\`\`\`html\n${el.elementHtml}\n\`\`\`\n\n`;

            md += `**Suggested Fix:**\n\`\`\`html\n${el.suggestedFixCode}\n\`\`\`\n\n`;

            md += `**Why this works:** ${el.fixReasoning}\n\n`;
            md += `---\n\n`;
        });
    }

    if (unanalysedElements.length > 0) {
        md += `\n## Not Analyzed\n\n`;
        md += `These elements could not be analyzed because of API errors. They are not cached, so re-running the audit retries only these.\n\n`;
        unanalysedElements.forEach(el => {
            md += `- \`<${el.tagName}>\`: ${el.error}\n`;
        });
    }

    fs.writeFileSync(outputPath, md);
    console.log(`Markdown report generated at ${outputPath}`);
}
