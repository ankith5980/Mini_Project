import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import { Verdict } from '../types';
import { isVerdict } from './cache';

dotenv.config();

const apiKey = process.env.GROQ_API_KEY || '';
const groq = new Groq({ apiKey });

export const MODEL = 'openai/gpt-oss-120b';
// Bump whenever the prompt or schema changes, so verdicts cached under the old prompt are not reused
export const PROMPT_VERSION = '2';

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

// Helper to wait before retrying
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export async function analyzeElement(elementHtml: string, parentHtml: string): Promise<Verdict> {
    const prompt = `
You are an expert accessibility engineer. Your task is to analyze an HTML/JSX element within its parent context to determine if it meets WCAG accessibility standards. 
You must output ONLY valid JSON without any markdown code blocks or conversational text.

Context:
Parent Code:
\`\`\`
${parentHtml}
\`\`\`

Target Element Code:
\`\`\`
${elementHtml}
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
    let delayMs = 1500;

    while (retries > 0) {
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
                // Fixed sampling settings so the same input gets the same answer as often as the API allows
                temperature: 0,
                seed: 42,
                reasoning_effort: 'medium',
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
            if (error.status === 503 || error.status === 429 || error.message?.includes('503') || error.message?.includes('429')) {
                console.warn(`[WARN] Groq API overloaded or rate limited. Retries left: ${retries - 1}. Retrying in ${delayMs}ms...`);
                retries--;
                if (retries === 0) {
                    throw new Error("API is currently experiencing high demand or rate limits. Please try again later.");
                }
                await delay(delayMs);
                delayMs *= 2;
            } else {
                console.error("Groq API Error:", error);
                throw error;
            }
        }
    }
    throw new Error("Exhausted retries");
}
