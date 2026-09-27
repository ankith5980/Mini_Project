import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import { ScannedElement } from './scanner';
import { Verdict, VerdictCache, cacheKey, isVerdict } from './cache';

dotenv.config();

const apiKey = process.env.GROQ_API_KEY || '';
const groq = new Groq({ apiKey });

export const MODEL = 'openai/gpt-oss-120b';
// Fixed sampling settings so the same input gets the same answer as often as the API allows
export const DETERMINISTIC_PARAMS = { temperature: 0, seed: 42, reasoning_effort: 'medium' } as const;
// Bump whenever the prompt or schema changes, so verdicts cached under the old prompt are not reused
const PROMPT_VERSION = '2';

const nullableString = { type: ['string', 'null'] };
const VERDICT_SCHEMA = {
    type: 'object',
    properties: {
        isAccessible: { type: 'boolean' },
        issueTitle: nullableString,
        explanation: nullableString,
        suggestedFixCode: nullableString,
        fixReasoning: nullableString
    },
    required: ['isAccessible', 'issueTitle', 'explanation', 'suggestedFixCode', 'fixReasoning'],
    additionalProperties: false
};

export interface AnalysisResult extends ScannedElement {
    isAccessible: boolean;
    issueTitle?: string | null;
    explanation?: string | null;
    suggestedFixCode?: string | null;
    fixReasoning?: string | null;
    cached?: boolean;
    error?: string;
}

// An element that could not be analysed (API error) is not an accessibility issue; it is reported separately
export const isIssue = (r: AnalysisResult) => !r.error && !r.isAccessible;
export const isUnanalysed = (r: AnalysisResult) => Boolean(r.error);

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function requestVerdict(element: ScannedElement): Promise<Verdict> {
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

    while (true) {
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
                model: MODEL,
                ...DETERMINISTIC_PARAMS,
                response_format: {
                    type: 'json_schema',
                    json_schema: { name: 'accessibility_verdict', schema: VERDICT_SCHEMA, strict: true }
                }
            });

            const text = completion.choices[0]?.message?.content;
            if (!text) {
                throw new Error("No text in response");
            }
            const parsed = JSON.parse(text);
            if (!isVerdict(parsed)) {
                throw new Error("Response did not match the verdict schema");
            }
            return {
                isAccessible: parsed.isAccessible,
                issueTitle: parsed.issueTitle,
                explanation: parsed.explanation,
                suggestedFixCode: parsed.suggestedFixCode,
                fixReasoning: parsed.fixReasoning
            };
        } catch (error: any) {
            const retryable = error.status === 503 || error.status === 429 || error.message?.includes('503') || error.message?.includes('429');
            retries--;
            if (!retryable || retries === 0) {
                throw retryable ? new Error("Failed to analyze due to API rate limits.") : error;
            }
            console.warn(`[WARN] Rate limited. Retries left: ${retries}. Retrying in ${delayMs}ms...`);
            await delay(delayMs);
            delayMs *= 2;
        }
    }
}

export async function analyzeElements(elements: ScannedElement[], cache: VerdictCache): Promise<AnalysisResult[]> {
    const results: AnalysisResult[] = [];
    let apiCalls = 0;
    console.log(`Analyzing ${elements.length} elements using Groq API...`);

    for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        const key = cacheKey(MODEL, PROMPT_VERSION, element.elementHtml, element.parentHtml);

        // Cache hits cover both earlier runs and identical elements earlier in this run
        const cachedVerdict = cache.get(key);
        if (cachedVerdict) {
            console.log(`Analyzing element ${i + 1}/${elements.length}: <${element.tagName}> (cached)`);
            results.push({ ...element, ...cachedVerdict, cached: true });
            continue;
        }

        // Wait briefly between requests to avoid rate limits
        if (apiCalls > 0) {
            await delay(1000);
        }
        apiCalls++;

        console.log(`Analyzing element ${i + 1}/${elements.length}: <${element.tagName}>...`);
        try {
            const verdict = await requestVerdict(element);
            cache.set(key, verdict);
            results.push({ ...element, ...verdict, cached: false });
        } catch (error: any) {
            // Errors are never cached, so the next run retries this element
            results.push({ ...element, isAccessible: false, error: error.message || "Unknown API error" });
        }

        // Persist progress periodically so an interrupted run keeps what it already paid for
        if (apiCalls % 20 === 0) {
            cache.save();
        }
    }

    return results;
}
