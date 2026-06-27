"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateJsonReport = generateJsonReport;
exports.generateMarkdownReport = generateMarkdownReport;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function generateJsonReport(results, outputPath) {
    const outputDir = path_1.default.dirname(outputPath);
    if (!fs_1.default.existsSync(outputDir)) {
        fs_1.default.mkdirSync(outputDir, { recursive: true });
    }
    fs_1.default.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`JSON report generated at ${outputPath}`);
}
function generateMarkdownReport(results, outputPath) {
    const outputDir = path_1.default.dirname(outputPath);
    if (!fs_1.default.existsSync(outputDir)) {
        fs_1.default.mkdirSync(outputDir, { recursive: true });
    }
    const failedElements = results.filter(r => !r.isAccessible);
    let md = `# Accessibility Audit Report\n\n`;
    md += `**Total Elements Scanned:** ${results.length}\n`;
    md += `**Accessibility Issues Found:** ${failedElements.length}\n\n`;
    if (failedElements.length === 0) {
        md += `🎉 Congratulations! No accessibility issues were found.\n`;
    }
    else {
        md += `## Issues Detected\n\n`;
        failedElements.forEach((el, i) => {
            md += `### ${i + 1}. <${el.tagName}>: ${el.issueTitle || 'Issue'}\n\n`;
            if (el.error) {
                md += `**Error during analysis:** ${el.error}\n\n`;
            }
            else {
                md += `**Explanation:** ${el.explanation}\n\n`;
                md += `**Original Code:**\n\`\`\`html\n${el.elementHtml}\n\`\`\`\n\n`;
                md += `**Suggested Fix:**\n\`\`\`html\n${el.suggestedFixCode}\n\`\`\`\n\n`;
                md += `**Why this works:** ${el.fixReasoning}\n\n`;
            }
            md += `---\n\n`;
        });
    }
    fs_1.default.writeFileSync(outputPath, md);
    console.log(`Markdown report generated at ${outputPath}`);
}
