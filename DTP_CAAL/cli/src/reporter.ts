import fs from 'fs';
import path from 'path';
import { AnalysisResult } from './analyzer';

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

    const failedElements = results.filter(r => !r.isAccessible);
    
    let md = `# Accessibility Audit Report\n\n`;
    md += `**Total Elements Scanned:** ${results.length}\n`;
    md += `**Accessibility Issues Found:** ${failedElements.length}\n\n`;

    if (failedElements.length === 0) {
        md += `🎉 Congratulations! No accessibility issues were found.\n`;
    } else {
        md += `## Issues Detected\n\n`;
        failedElements.forEach((el, i) => {
            md += `### ${i + 1}. <${el.tagName}>: ${el.issueTitle || 'Issue'}\n\n`;
            if (el.error) {
                md += `**Error during analysis:** ${el.error}\n\n`;
            } else {
                md += `**Explanation:** ${el.explanation}\n\n`;
                
                md += `**Original Code:**\n\`\`\`html\n${el.elementHtml}\n\`\`\`\n\n`;
                
                md += `**Suggested Fix:**\n\`\`\`html\n${el.suggestedFixCode}\n\`\`\`\n\n`;
                
                md += `**Why this works:** ${el.fixReasoning}\n\n`;
            }
            md += `---\n\n`;
        });
    }

    fs.writeFileSync(outputPath, md);
    console.log(`Markdown report generated at ${outputPath}`);
}
