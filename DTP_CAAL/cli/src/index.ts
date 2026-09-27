#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { scanPage } from './scanner';
import { analyzeElements, isIssue, isUnanalysed } from './analyzer';
import { VerdictCache } from './cache';
import { generateJsonReport, generateMarkdownReport } from './reporter';
import { autoFix } from './remediator';

const program = new Command();

program
  .name('dtp-caal')
  .description('Context-Aware Accessibility Linter CLI')
  .version('1.1.0')
  .requiredOption('-u, --url <url>', 'URL to scan (e.g., http://localhost:3000)', 'http://localhost:3000')
  .option('-o, --output <path>', 'Output file path', './caal-report.md')
  .option('-f, --format <format>', 'Output format (json or md)', 'md')
  .option('--auto-fix', 'Automatically attempt to fix source files (beta)')
  .option('--src-dir <path>', 'Directory containing source files for auto-fix', './')
  .option('--cache <path>', 'Verdict cache file; unchanged elements reuse their previous verdict', './.caal-cache.json')
  .option('--no-cache', 'Ignore the cache file and analyze every element fresh')
  .action(async (options) => {
    // options.cache is the file path, or false when --no-cache is passed
    const cache = new VerdictCache(options.cache || null);

    try {
      console.log(chalk.blue(`Starting accessibility audit for: ${options.url}`));

      // Step 1: Scan page and extract elements
      const scannedElements = await scanPage(options.url);

      if (scannedElements.length === 0) {
        console.log(chalk.yellow('No relevant elements found to analyze.'));
        return;
      }

      // Step 2: Analyze with LLM (cached verdicts are reused)
      if (!process.env.GROQ_API_KEY) {
        console.error(chalk.red('Error: GROQ_API_KEY environment variable is not set.'));
        process.exit(1);
      }
      if (options.cache) {
        console.log(chalk.gray(`Using verdict cache ${options.cache} (${cache.size} entries)`));
      }
      const results = await analyzeElements(scannedElements, cache);
      cache.save();

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
      const cachedCount = results.filter(r => r.cached).length;
      console.log(chalk.gray(`\n${cachedCount}/${results.length} verdicts came from the cache.`));

      const issueCount = results.filter(isIssue).length;
      const unanalysedCount = results.filter(isUnanalysed).length;
      if (unanalysedCount > 0) {
        console.log(chalk.yellow(`${unanalysedCount} elements could not be analyzed (API errors). Re-run to retry only those.`));
      }
      if (issueCount > 0) {
        console.log(chalk.red(`\nFound ${issueCount} accessibility issues!`));
        process.exit(1);
      } else if (unanalysedCount > 0) {
        // Incomplete audit: not a pass, but distinguishable from real issues
        process.exit(2);
      } else {
        console.log(chalk.green('\nAll checks passed! 🎉'));
        process.exit(0);
      }

    } catch (error) {
      cache.save();
      console.error(chalk.red('Audit failed:'), error);
      process.exit(1);
    }
  });

program.parse(process.argv);
