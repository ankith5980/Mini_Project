import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { analyzeElement, MODEL, PROMPT_VERSION } from './services/llm';
import { VerdictCache, cacheKey } from './services/cache';
import { AnalyzeRequest, AnalyzeResponse, Verdict } from './types';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// CACHE_FILE=off keeps verdicts in memory only
const cacheFile = process.env.CACHE_FILE ?? '.caal-cache.json';
const cache = new VerdictCache(cacheFile === 'off' ? null : cacheFile);
// Identical requests that arrive while the first is still being analysed share its result
const inFlight = new Map<string, Promise<{ verdict: Verdict; analyzedAt: number }>>();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.post('/api/v1/analyze', async (req: Request, res: Response): Promise<void> => {
    try {
        const { elementHtml, parentHtml, noCache } = req.body as AnalyzeRequest;

        if (!elementHtml || !parentHtml) {
            res.status(400).json({ error: 'elementHtml and parentHtml are required' });
            return;
        }

        const key = cacheKey(MODEL, PROMPT_VERSION, elementHtml, parentHtml);

        if (!noCache) {
            const hit = cache.get(key);
            if (hit) {
                res.json({ ...hit.verdict, cached: true, ageMs: Date.now() - hit.analyzedAt } satisfies AnalyzeResponse);
                return;
            }
        }

        let pending = noCache ? undefined : inFlight.get(key);
        if (!pending) {
            console.log(`Analyzing element with LLM (${noCache ? 'cache bypassed' : 'cache miss'}) ${key.slice(0, 12)}`);
            const request = analyzeElement(elementHtml, parentHtml)
                .then(verdict => {
                    const analyzedAt = Date.now();
                    cache.set(key, verdict, analyzedAt);
                    return { verdict, analyzedAt };
                })
                .finally(() => {
                    // A later noCache request may have replaced this entry; only remove our own
                    if (inFlight.get(key) === request) inFlight.delete(key);
                });
            inFlight.set(key, request);
            pending = request;
        }

        const { verdict, analyzedAt } = await pending;
        res.json({ ...verdict, cached: false, ageMs: Date.now() - analyzedAt } satisfies AnalyzeResponse);
    } catch (error: any) {
        console.error('Analysis error:', error);
        res.status(500).json({ error: error.message || 'Internal server error during analysis' });
    }
});

app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
});

// Flush pending cache writes before the process exits (e.g. Render restarts, Ctrl+C)
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
        cache.save();
        process.exit(0);
    });
}
