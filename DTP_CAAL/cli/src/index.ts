#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { scanPage } from './scanner';
import { analyzeElements } from './analyzer';
import { generateJsonReport, generateMarkdownReport } from './reporter';
import { autoFix } from './remediator';

const program = new Command();

program
  .name('a11y-audit')
  .description('Context-Aware Accessibility Linter CLI')
  .version('1.0.0')
  .requiredOption('-u, --url <url>', 'URL to scan (e.g., http://localhost:3000)', 'http://localhost:3000')
  .option('-o, --output <path>', 'Output file path', './caal-report.md')
  .option('-f, --format <format>', 'Output format (json or md)', 'md')
  .option('--auto-fix', 'Automatically attempt to fix source files (beta)')
  .option('--src-dir <path>', 'Directory containing source files for auto-fix', './')
  .action(async (options) => {
    try {
      console.log(chalk.blue(`Starting accessibility audit for: ${options.url}`));
      
      // Step 1: Scan page and extract elements
      const scannedElements = await scanPage(options.url);
      
      if (scannedElements.length === 0) {
        console.log(chalk.yellow('No relevant elements found to analyze.'));
        return;
      }
      
      // Step 2: Analyze with LLM
      if (!process.env.GROQ_API_KEY) {
        console.error(chalk.red('Error: GROQ_API_KEY environment variable is not set.'));
        process.exit(1);
      }
      const results = await analyzeElements(scannedElements);
      
      // Step 3: Report
      const format = options.format.toLowerCase();
      if (format === 'json' || options.output.endsWith('.json')) {
        generateJsonReport(results, options.output);
      } else {
        generateMarkdownReport(results, options.output);
      }
      
      // Step 4: Auto-Fix if enabled
      if (options.autoFix) {
        await autoFix(results, options.srcDir);
      }
      
      // Step 5: Exit with error code if issues found (useful for CI/CD)
      const failedElements = results.filter(r => !r.isAccessible);
      if (failedElements.length > 0) {
        console.log(chalk.red(`\nFound ${failedElements.length} accessibility issues!`));
        process.exit(1);
      } else {
        console.log(chalk.green('\nAll checks passed! 🎉'));
        process.exit(0);
      }
      
    } catch (error) {
      console.error(chalk.red('Audit failed:'), error);
      process.exit(1);
    }
  });

program.parse(process.argv);
