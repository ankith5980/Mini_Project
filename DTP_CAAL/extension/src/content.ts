// Content script to extract DOM and highlight elements
console.log('DTP_CAAL Content Script Loaded');

export function extractContext(element: HTMLElement) {
    const parent = element.parentElement;
    
    let parentHtml = '';
    if (parent) {
        // Clone to avoid modifying the actual page
        const clone = parent.cloneNode(true) as HTMLElement;
        
        // Remove massive irrelevant tags that blow up the LLM context window on localhost
        clone.querySelectorAll('script, style').forEach(el => el.remove());
        
        parentHtml = clone.outerHTML;
        // Truncate to a safe size (~15k chars is well within Groq limits)
        if (parentHtml.length > 15000) {
            parentHtml = parentHtml.substring(0, 15000) + '\n... [TRUNCATED]';
        }
    }
    
    return {
        elementHtml: element.outerHTML,
        parentHtml
    };
}

export function highlightElement(element: HTMLElement, isError: boolean) {
    // Save original outline just in case
    element.setAttribute('data-original-outline', element.style.outline);
    element.style.outline = isError ? '3px solid red' : '3px solid green';
    element.style.outlineOffset = '2px';
}

export function removeHighlight(element: HTMLElement) {
    const original = element.getAttribute('data-original-outline');
    if (original !== null) {
        element.style.outline = original;
        element.removeAttribute('data-original-outline');
    } else {
        element.style.outline = '';
    }
    element.style.outlineOffset = '';
}

function detectTechStack() {
    const stack: { name: string, category: string }[] = [];
    const add = (name: string, category: string) => {
        if (!stack.some(t => t.name === name)) stack.push({ name, category });
    };
    
    const html = document.documentElement.outerHTML.toLowerCase();
    const scripts = Array.from(document.scripts).map(s => s.src.toLowerCase());
    const metaGenerator = document.querySelector('meta[name="generator"]')?.getAttribute('content')?.toLowerCase() || '';

    // JavaScript Frameworks & Web frameworks
    if (document.getElementById('__next') || scripts.some(s => s.includes('_next/static'))) {
        add('Next.js', 'Web frameworks');
        add('Next.js', 'Static site generators');
        add('React', 'JavaScript frameworks');
    } else if (document.querySelector('[data-reactroot], [data-reactid], [id="root"]') || scripts.some(s => s.includes('react') || s.includes('react-dom')) || html.includes('__react_')) {
        add('React', 'JavaScript frameworks');
    }
    
    if (document.getElementById('__nuxt') || scripts.some(s => s.includes('_nuxt/'))) {
        add('Nuxt.js', 'Web frameworks');
        add('Vue.js', 'JavaScript frameworks');
    } else if (document.querySelector('[data-v-app]') || scripts.some(s => s.includes('vue'))) {
        add('Vue.js', 'JavaScript frameworks');
    }
    
    if (document.querySelector('[ng-app], [ng-version], [data-ng-app]') || scripts.some(s => s.includes('angular'))) {
        add('Angular', 'JavaScript frameworks');
    }

    // UI frameworks
    if (document.querySelector('[class*="flex "], [class*="text-"], [class*="bg-"]')) {
        add('Tailwind CSS', 'UI frameworks');
    }
    if (html.includes('bootstrap.css') || html.includes('bootstrap.min.css') || html.includes('bootstrap-')) {
        add('Bootstrap', 'UI frameworks');
    }
    if (html.includes('mui-') || document.querySelector('[class*="Mui"]')) {
        add('Material UI', 'UI frameworks');
    }
    if (html.includes('radix-') || document.querySelector('[data-radix-poppable], [data-radix-collection-item]')) {
        add('Radix UI', 'UI frameworks');
    }
    if (html.includes('radix-') && html.includes('lucide-')) {
        add('shadcn/ui', 'UI frameworks');
    }

    // CMS
    if (html.includes('wp-content') || metaGenerator.includes('wordpress')) {
        add('WordPress', 'CMS');
    }
    if (metaGenerator.includes('webflow')) {
        add('Webflow', 'CMS');
    }
    if (html.includes('cdn.shopify.com')) {
        add('Shopify', 'CMS');
    }

    // JavaScript libraries
    if (scripts.some(s => s.includes('gsap') || s.includes('tweenmax')) || html.includes('gsap.')) {
        add('GSAP', 'JavaScript frameworks'); // Matching user's image where GSAP is under JS frameworks
    }
    if (scripts.some(s => s.includes('three.js') || s.includes('three.min.js') || s.includes('/three/')) || html.includes('three.js')) {
        add('Three.js', 'JavaScript libraries');
    }
    if (html.includes('framer-motion') || document.querySelector('[data-framer-name], [data-framer-component-type]')) {
        add('Framer Motion', 'JavaScript libraries');
    }
    if (scripts.some(s => s.includes('lottie')) || document.querySelector('lottie-player, [data-lottie]')) {
        add('Lottie', 'JavaScript libraries');
    }
    if (scripts.some(s => s.includes('anime.js') || s.includes('anime.min.js'))) {
        add('Anime.js', 'JavaScript libraries');
    }
    if (document.querySelector('[data-scroll-container]') || html.includes('locomotive-scroll')) {
        add('Locomotive Scroll', 'JavaScript libraries');
    }
    if (scripts.some(s => s.includes('lenis')) || html.includes('lenis')) {
        add('Lenis', 'JavaScript libraries');
    }

    // Font scripts
    if (html.includes('lucide') || html.includes('lucide-react')) {
        add('Lucide', 'Font scripts');
    }
    if (html.includes('fontawesome') || html.includes('font-awesome')) {
        add('Font Awesome', 'Font scripts');
    }

    // Security
    if (scripts.some(s => s.includes('challenges.cloudflare.com/turnstile')) || html.includes('turnstile')) {
        add('Cloudflare Turnstile', 'Security');
    }
    if (scripts.some(s => s.includes('recaptcha'))) {
        add('reCAPTCHA', 'Security');
    }

    // Development
    if (html.includes('turbopack') || html.includes('_next/static/webpack')) {
        add('Turbopack', 'Development');
    }
    if (html.includes('vite')) {
        add('Vite', 'Development');
    }

    // PaaS
    if (html.includes('vercel')) {
        add('Vercel', 'PaaS');
    }
    if (html.includes('netlify')) {
        add('Netlify', 'PaaS');
    }

    // Miscellaneous
    if (document.querySelector('meta[property^="og:"]')) {
        add('Open Graph', 'Miscellaneous');
    }

    return stack;
}

// We will track the currently selected element
let currentSelectedElement: HTMLElement | null = null;

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'scanElements') {
        // Collect all potential interactive or semantic elements
        const elements = Array.from(document.querySelectorAll('button, img, input, a, [role="button"], [role="link"], [role="img"]')) as HTMLElement[];
        
        // Return a summary of elements to the popup so it can decide what to do
        const summary = elements.map((el, index) => {
            // Assign an ID if it doesn't have one, or just use index
            el.setAttribute('data-caal-id', index.toString());
            return {
                id: index.toString(),
                tagName: el.tagName.toLowerCase(),
                text: el.innerText?.substring(0, 30) || el.getAttribute('alt') || el.getAttribute('aria-label') || 'No text/label'
            };
        });
        
        sendResponse({ elements: summary, techStack: detectTechStack() });
    }
    
    if (request.action === 'analyzeSpecificElement') {
        const id = request.payload.id;
        const target = document.querySelector(`[data-caal-id="${id}"]`) as HTMLElement;
        
        if (target) {
            const context = extractContext(target);
            // Highlight it while analyzing
            if (currentSelectedElement) removeHighlight(currentSelectedElement);
            highlightElement(target, true);
            currentSelectedElement = target;
            
            sendResponse({ context });
        } else {
            sendResponse({ error: 'Element not found' });
        }
    }
    
    if (request.action === 'clearHighlights') {
        if (currentSelectedElement) {
            removeHighlight(currentSelectedElement);
            currentSelectedElement = null;
        }
        sendResponse({ success: true });
    }
});
