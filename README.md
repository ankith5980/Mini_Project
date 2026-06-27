**Product Idea ::**
Developer Tools Path: Context Aware Accessibility Linter


**The Real-World Problem ::**
- Digital accessibility is no longer a moral obligation; it is a strict legal and financial requirement.
- *The Human Impact ::*
    -  Approximately 15% of the global population experiences some form of disability.
    - When web applications are built without accessibility in mind, millions of users relying on screen readers, keyboard navigation, or voice commands are entirely locked out of essential services (banking, healthcare, e-commerce).

- *The Legal and Financial Risk ::*
    - In recent years, lawsuits under the ADA (Americans with Disabilities Act) and the European Accessibility Act (EAA) have skyrocketed.
    - Companies are being sued for millions because their websites are unusable by disabled individuals (e.g., the famous Domino's Pizza Supreme Court case).

- *The Developer Friction ::*
    - Developers generally want to build accessible software, but the official guidelines (WCAG - Web Content Accessibility Guidelines) are incredibly dense, confusing, and difficult to implement.
    - Accessibility is usually treated as an afterthought, tested only right before (or after) a product launches.


**The Shortcomings of Existing Systems ::**
- The industry currently relies on automated testing tools like Lighthouse, axe-core, and WAVE. While these tools are standard, they have massive, fundamental flaws:
- *Flaw 1 ::*
    - They are "Rule-Based," Not "Semantic". Existing tools rely on static Regex and DOM parsing rules. They can only check if a syntax rule is broken.
    - *Example ::*  If you have an image <img src="dog.png" alt="image123.png">, current tools will pass this as "100% Accessible" because the alt attribute technically exists. They do not understand that "image123.png" is completely useless to a blind user listening to a screen reader.

- *Flaw 2 ::*
    - Inability to Understand Context. Modern web apps use generic components.
    - *Example ::*  A news website might have five articles, each with a <button>Read More</button>. A static tool sees valid HTML. But a blind user tabbing through the site just hears "Button, Read More... Button, Read More" with zero context. Current tools cannot detect this contextual failure.

- *Flaw 3 ::*
    - "Flagging" vs. "Fixing"
    - When an existing tool finds an error (e.g., a custom dropdown menu missing ARIA states), it simply throws a warning: "Missing aria-expanded attribute" and provides a link to a 10-page WCAG documentation site. It forces the developer to stop working, read the docs, and figure out how to write the complex ARIA code themselves.


**Proposed Solution :: A Context-Aware LLM Linter**
- The project shifts from Static Syntax Checking to Context-Aware Semantic Analysis by leveraging Large Language Models.

- *Advantage 1 ::*
    - Contextual Understanding. Because the tool feeds the DOM surroundings to an AI, it understands semantic intent.
    - The "Read More" Solution: If the tool scans the <button>Read More</button>, it will look at the parent <article> tag, realize the article is about "SpaceX", and flag the button. It will instantly recognize that a screen reader needs context.

- *Advantage 2 ::*
    - Automated Remediation (Writing the Code). Instead of just complaining that something is broken, the tool acts as an automated accessibility engineer.
    - It doesn't just say "Fix this image." It says: "This image shows a line graph trending upwards. Replace your code with <img src="graph.png" alt="Line graph showing Q3 revenue increasing by 15%">." * For the Read More button, it will output: <button aria-label="Read more about SpaceX">Read More</button>.

- *Advantage 3 ::*
    - "Shift-Left" Workflow Integration. By starting as a browser extension (Phase 1) and moving to a CI/CD pipeline (Phase 2), it bring accessibility checks directly into the developer's immediate workflow.
    - They don't have to wait for a QA team to find bugs weeks later; the code is analyzed, explained, and fixed while they are building it.


**Phases of Development ::**
- **GOAL FOR PHASE 1 & 2 :: Build a functional, deployable Chrome Extension that proves the core concept: using DOM context and AI to fix accessibility errors dynamically.**
- *Phase 1 :: Core Engine & Scaffolding*
    - *OBJECTIVE ::* Get the underlying extension architecture running and talking to the AI.

    - *STEP 1 : MANIFEST & PERMISSIONS ::* Create the manifest.json (Manifest V3 standard). Define permissions for activeTab (to read the current page) and scripting (to inject our logic).

    - *STEP 2 : THE CONTENT SCRIPT (DOM EXTRACTOR) ::* Write the JavaScript that gets injected into the webpage. It must identify target elements (buttons, images, forms) and cleanly extract both the element's HTML and its parent's HTML (the context).

    - *STEP 3 : THE SERVICE WORKER (API BRIDGE) ::* Set up the background script. This acts as the secure middleman, taking the extracted DOM context from the Content Script and sending it to the Gemini API or any other coding LLM API using the exact prompt structure we established in the simulator.

    - *Deliverable ::* A "headless" extension. When you click a button in the browser toolbar, it successfully logs the AI's suggested fixes in the browser console.

- *Phase 2 :: UI/UX & Refinements*
    - *OBJECTIVE ::* Make the tool usable for a developer

    - *STEP 1 : The Sidebar/Popup UI ::* Build the visual interface (using HTML/Tailwind CSS or React, injected into a shadow DOM so it doesn't break the host page's styling).

    - *STEP 2 : Visual Highlighting ::* When an error is found, the Content Script must draw a red border around the specific element on the live webpage so the developer knows exactly what is broken.

    - *STEP 3 : Actionable Output ::* Display the AI's explanation and the generated fix code in the UI, complete with a "Copy to Clipboard" button.

    *DELIVERABLE ::* A fully functioning Chrome Extension that developers can install locally and use to audit web pages in real-time.

**GOAL FOR PHASE 3 & 4 :: Transition the tool from a manual, local browser extension into an automated, production-grade CI/CD pipeline integration (a B2B SaaS architecture).**
- *Phase 3 :: The CLI & Headless Browser Automation*
    - *OBJECTIVE ::* Move the core logic out of the Chrome Extension and into a command-line tool that can run on a server without a human clicking anything.

    - *STEP 1 : Node.js CLI CONVERSION ::* Port the AI interaction logic and DOM parsing rules into a Node.js application.

    - *STEP 2 : PUPPETEER/PLAYWRIGHT INTEGRATION ::* Instead of a human opening a browser, write a script using Playwright. The script will automatically launch a headless browser, navigate to a specified local URL (e.g., localhost:3000), wait for the framework (React/Angular) to render the DOM, and run the extraction engine.

    - *STEP 3 : BULK REPORTING ::* Modify the output so instead of a UI popup, it generates a structured JSON report or a formatted Markdown file summarizing all accessibility failures across the entire application.

    - *DELIVERABLE ::* A CLI tool where a developer can type npm run a11y-audit, and the system automatically spins up the app, scans it, and spits out a report.

- *Phase 4 :: CI/CD Pipeline & "Shift-Left" Integration*
    - *OBJECTIVE ::* Automate the auditing process within the standard software development lifecycle.

    - *STEP 1 : GITHUB ACTIONS SETUP ::* Create a .github/workflows/a11y-linter.yml file. Configure it to run your CLI tool automatically every time a developer opens a Pull Request (PR).

    - *STEP 2 : PR BLOCKING & COMMENTING ::* If the AI detects a critical accessibility violation (e.g., a non-navigable modal), the GitHub Action must fail the build (block the PR from being merged).

    - *STEP 3 : AUTOMATED REMEDIATION ("WOW" FACTOR) ::* Program the GitHub Action to not just fail the build, but to use the AI's output to automatically comment on the PR with the exact code snippet required to fix the issue.

    - *DELIVERABLE ::* A full DevSecOps accessibility pipeline


**Conclusion ::**
- While existing tools act as "spell-checkers" for HTML syntax, our solution acts as a "grammar and context editor" for web accessibility.
- By reducing the cognitive load on developers and providing exact, copy-pasteable ARIA code, we ensure that producing accessible, legally compliant software becomes the path of least resistance.


**Final ::**
- Package this tool into a GitHub Action or a CI/CD pipeline integration. 
- Whenever a developer opens a Pull Request, your system automatically spins up the frontend, runs visual and structural accessibility tests, and automatically blocks the merge—or generates a fix commit—if the new code breaks accessibility standards. 
- This is highly marketable as a B2B SaaS product.


**Working Instructions (For End Users)::**

Now that the tool is ready for public distribution, anyone can use it easily without needing to clone the repository!

### Using the CLI via NPM (npx)
You can run the accessibility audit on any project instantly using `npx`. 

1. Ensure you have your target web application running (e.g., `http://localhost:3000`).
2. Set your API key in your terminal environment:
   ```bash
   # On macOS/Linux:
   export GROQ_API_KEY="your_api_key_here"
   
   # On Windows (PowerShell):
   $env:GROQ_API_KEY="your_api_key_here"
   ```
3. Run the audit directly from NPM:
   ```bash
   # Basic Scan
   npx dtp-caal --url http://localhost:3000

   # Automated Source Code Remediation (Auto-Fix)
   npx dtp-caal --url http://localhost:3000 --auto-fix --src-dir ./src
   ```

### Using the Chrome Extension (CURRENTLY NOT AVAILABLE)
1. Install the **Context-Aware Accessibility Linter** extension from the Chrome Web Store.
2. Navigate to the website or local web app you want to test.
3. Open the extension popup, ensure the backend API URL is configured correctly if you are hosting your own instance, and click **Analyze**.
4. The extension will highlight broken elements in red and provide you with the exact AI-generated code to fix them!
