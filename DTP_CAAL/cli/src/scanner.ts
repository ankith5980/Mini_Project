import { chromium } from 'playwright';

export interface ScannedElement {
    id: string;
    tagName: string;
    elementHtml: string;
    parentHtml: string;
}

export async function scanPage(url: string): Promise<ScannedElement[]> {
    console.log(`\nNavigating to ${url}...`);
    
    // Launch headless chromium
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        console.log('Page loaded. Extracting elements...');

        // Wait a tiny bit extra for framework rendering if needed
        await page.waitForTimeout(2000);

        // Evaluate extraction logic in the page context
        const extractedElements = await page.evaluate(() => {
            function extractContext(element: HTMLElement) {
                const parent = element.parentElement;
                
                let parentHtml = '';
                if (parent) {
                    const clone = parent.cloneNode(true) as HTMLElement;
                    clone.querySelectorAll('script, style').forEach(el => el.remove());
                    
                    parentHtml = clone.outerHTML;
                    if (parentHtml.length > 15000) {
                        parentHtml = parentHtml.substring(0, 15000) + '\\n... [TRUNCATED]';
                    }
                }
                
                return {
                    elementHtml: element.outerHTML,
                    parentHtml
                };
            }

            const elements = Array.from(document.querySelectorAll('button, img, input, a, [role="button"], [role="link"], [role="img"]')) as HTMLElement[];
            
            return elements.map((el, index) => {
                const context = extractContext(el);
                return {
                    id: index.toString(),
                    tagName: el.tagName.toLowerCase(),
                    elementHtml: context.elementHtml,
                    parentHtml: context.parentHtml
                };
            });
        });

        console.log(`Found ${extractedElements.length} elements to analyze.`);
        return extractedElements;

    } catch (error) {
        console.error(`Error scanning page: ${error}`);
        throw error;
    } finally {
        await browser.close();
    }
}
