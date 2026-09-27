# dtp-caal (Context-Aware Accessibility Linter)

[![npm version](https://img.shields.io/npm/v/dtp-caal.svg)](https://www.npmjs.com/package/dtp-caal)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Playwright](https://img.shields.io/badge/tested%20with-Playwright-2EAD33.svg)](https://playwright.dev/)
[![WCAG Compliant](https://img.shields.io/badge/standards-WCAG%202.1%20AA-orange.svg)](https://www.w3.org/WAI/standards-guidelines/wcag/)

> **Next-generation, context-aware web accessibility auditing and automated remediation powered by Headless Browser automation and LLMs.**

---

## 📌 Overview

Traditional accessibility tools (like Lighthouse, axe-core, and WAVE) rely on static DOM syntax checks and regular expressions. While effective for basic rules, they suffer from fundamental limitations:

1. **They are "Rule-Based", Not "Semantic":** An image with `<img src="hero.png" alt="photo.jpg">` passes static tests because an `alt` attribute is technically present—even though "photo.jpg" is meaningless to a screen-reader user.
2. **Inability to Understand Context:** Generic elements like multiple `<button>Read More</button>` links pass syntax checks, but screen readers cannot determine which article or topic each button relates to.
3. **Flagging vs. Fixing:** Existing tools dump warnings with links to dense WCAG documentation, forcing developers to manually decipher and write complex ARIA markup.

**`dtp-caal`** shifts accessibility testing from static syntax checking to **context-aware semantic analysis**:
- It launches a headless browser via **Playwright** to let single-page applications (React, Vue, Next.js, Angular, etc.) fully render.
- It extracts interactive elements along with their **surrounding parent DOM context**.
- It uses high-performance LLMs (via the **Groq API**) to assess accessibility intent and generate exact, framework-compliant ARIA code.
- With the `--auto-fix` option, it automatically finds the corresponding component in your source directory and patches the fix directly!

---

## ✨ Features

- 🌐 **Headless Browser Scanning:** Accurately audits dynamic, client-side rendered Single Page Applications (SPAs) using Playwright.
- 🧠 **Context-Aware Semantic Analysis:** Analyzes target elements in conjunction with their surrounding DOM tree to understand intent.
- 🛠️ **Automated Source Remediation (`--auto-fix`):** Locates the responsible source file (`.tsx`, `.jsx`, `.html`, `.vue`, etc.) and patches the fix directly.
- 📊 **Multi-Format Reporting:** Generates clean, human-readable **Markdown (`.md`)** reports or structured **JSON (`.json`)** summaries.
- 🚀 **CI/CD & Pull Request Integration:** Exits with code `1` upon detecting accessibility violations to guard against PR regressions in CI/CD pipelines.

---

## 📋 Prerequisites

1. **Node.js**: Version 18 or higher (Node 20+ recommended).
2. **Groq API Key**: `dtp-caal` uses Groq for fast inference. You can get a free key from the [Groq Console](https://console.groq.com/).
3. **Playwright Chromium**: Playwright headless browser binaries must be installed.

---

## 🚀 Installation & Quick Start

### 1. Instant Run with `npx` (Recommended)

You can run `dtp-caal` on any project immediately without installing it globally:

```bash
# Set your API Key
# Linux / macOS:
export GROQ_API_KEY="your_groq_api_key_here"

# Windows (PowerShell):
$env:GROQ_API_KEY="your_groq_api_key_here"

# Install Chromium browser binaries (first-time only)
npx playwright install chromium

# Run the audit against your local dev server
npx dtp-caal --url http://localhost:3000
```

---

### 2. Global Installation

Install globally across your machine:

```bash
npm install -g dtp-caal
npx playwright install chromium

# Run anywhere
dtp-caal --url http://localhost:3000
```

---

### 3. Local Project Dependency

Install within your web project:

```bash
npm install --save-dev dtp-caal
npx playwright install chromium
```

Add an audit script to your `package.json`:

```json
{
  "scripts": {
    "a11y:audit": "dtp-caal --url http://localhost:3000",
    "a11y:fix": "dtp-caal --url http://localhost:3000 --auto-fix --src-dir ./src"
  }
}
```

Then run:

```bash
npm run a11y:audit
```

---

## 💻 CLI Usage & Commands

### Basic Audit
Audit a local or remote URL and output a Markdown report:
```bash
dtp-caal --url http://localhost:3000
```

### Automated Remediation (Auto-Fix)
Audit the rendered application and apply source code patches directly to your project files:
```bash
dtp-caal --url http://localhost:3000 --auto-fix --src-dir ./src
```
> **Note:** Changes made by `--auto-fix` are left uncommitted in your working tree so you can review diffs (`git diff`) before committing.

### Custom Output Report Path and Format
Generate a JSON report for programmatic consumption or custom CI dashboards:
```bash
dtp-caal --url http://localhost:3000 --format json --output ./reports/a11y-results.json
```

---

## ⚙️ CLI Options Reference

| Flag | Shorthand | Default | Description |
| :--- | :--- | :--- | :--- |
| `--url <url>` | `-u` | `http://localhost:3000` | The URL of the web page to scan. |
| `--output <path>` | `-o` | `./caal-report.md` | Destination file path for the audit report. |
| `--format <format>`| `-f` | `md` | Output format: `md` (Markdown) or `json` (JSON). |
| `--auto-fix` | | `false` | Automatically attempt to locate and patch source files. |
| `--src-dir <path>` | | `./` | Directory containing source files when `--auto-fix` is enabled. |
| `--help` | `-h` | | Display help and argument descriptions. |
| `--version` | `-v` | | Display CLI version. |

---

## 🔍 How It Works

```
┌────────────────────────┐
│  Running Web App       │ (e.g., http://localhost:3000)
└───────────┬────────────┘
            │ 1. Navigate & Render (Playwright)
            ▼
┌────────────────────────┐
│  Target Elements &     │ (Buttons, images, inputs, links +
│  Parent DOM Context    │  surrounding contextual HTML)
└───────────┬────────────┘
            │ 2. Semantic Evaluation
            ▼
┌────────────────────────┐
│  Groq LLM Engine       │ (WCAG validation, explanation,
│  (openai/gpt-oss-120b) │  and precise code replacement)
└───────────┬────────────┘
            │ 3. Output
      ┌─────┴────────────────────────┐
      ▼                              ▼
┌────────────────────┐    ┌───────────────────────────┐
│ Report Generated   │    │ Auto-Fix Applied          │
│ (.md / .json)      │    │ (Direct source file patch)│
└────────────────────┘    └───────────────────────────┘
```

1. **Extraction:** Playwright launches headless Chromium, navigates to the specified URL, waits for network idle, and queries target elements (`button`, `img`, `input`, `a`, `[role="button"]`, etc.). For each element, it extracts both the element's markup and sanitized parent container HTML.
2. **Contextual Analysis:** Each element is analyzed using Groq's LLM endpoint. The prompt instructs the model to act as an accessibility engineer, identifying WCAG failures and synthesizing valid replacement markup.
3. **Reporting:** Results are structured into either a Markdown document or JSON file.
4. **Remediation:** If `--auto-fix` is passed, the tool searches the specified `--src-dir` for files containing matching tokens, prompts the LLM to integrate the accessibility fix while preserving framework syntax (JSX, Vue, standard HTML), and updates the source files.
5. **Exit Code:** If any element fails WCAG checks, the CLI terminates with exit code `1`, making it ideal for CI/CD gates.

---

## 🤖 CI/CD Integration (GitHub Actions)

You can easily integrate `dtp-caal` into your pull request pipeline to block regressions and post automated fixes:

```yaml
name: Accessibility Linter (CAAL)

on:
  pull_request:
    branches: [ main, master ]

jobs:
  a11y-audit:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install App Dependencies & Build
        run: |
          npm ci
          npm run build --if-present

      - name: Start App Server
        run: |
          npm run start &
          npx wait-on http://localhost:3000

      - name: Install Playwright Browsers
        run: npx playwright install --with-deps chromium

      - name: Run Accessibility Audit
        id: a11y_audit
        continue-on-error: true
        env:
          GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
        run: |
          npx dtp-caal --url http://localhost:3000 --output ./caal-report.md --auto-fix --src-dir ./src

      - name: Generate Fix Patch
        id: git_diff
        run: |
          git diff > caal-fix.patch
          if [ -s caal-fix.patch ]; then
            echo "has_fixes=true" >> $GITHUB_OUTPUT
          fi

      - name: Comment on PR
        if: steps.a11y_audit.outcome == 'failure'
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const fs = require('fs');
            const report = fs.readFileSync('caal-report.md', 'utf8');
            let body = `## 🚨 Accessibility Audit Failed\n\n${report}`;
            
            if (fs.existsSync('caal-fix.patch')) {
              const patch = fs.readFileSync('caal-fix.patch', 'utf8');
              if (patch.trim()) {
                body += `\n\n### 🛠️ Suggested Code Fix\n\`\`\`diff\n${patch}\n\`\`\``;
              }
            }
            
            await github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: body
            });
            core.setFailed('Accessibility violations detected.');
```

---

## 🛠️ Local Development & Building

If you are contributing to or modifying the CLI module:

```bash
# Clone the repository
git clone https://github.com/ankith5980/Mini_Project.git
cd Mini_Project/DTP_CAAL/cli

# Install dependencies
npm install

# Build TypeScript to dist/
npm run build

# Run in development mode
npm start -- --url http://localhost:3000
```

---

## ❓ Troubleshooting

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| `Error: GROQ_API_KEY environment variable is not set.` | Missing API key in environment. | Set `GROQ_API_KEY` via `export`, `set`, PowerShell `$env:`, or a `.env` file. |
| `browserType.launch: Executable doesn't exist` | Playwright browser binaries not installed. | Run `npx playwright install chromium` or `npx playwright install --with-deps chromium`. |
| `Page load timeout / net::ERR_CONNECTION_REFUSED` | The target server is not running on the specified URL. | Ensure your development server is active before running the audit (e.g. `npm run dev`). |

---

## 📄 License

This project is licensed under the [ISC License](LICENSE).
