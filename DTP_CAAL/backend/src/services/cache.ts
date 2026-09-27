import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Verdict } from '../types';

interface CacheEntry {
    verdict: Verdict;
    analyzedAt: number; // when the LLM produced this verdict
    lastUsed: number;
}

// Oldest-used entries are evicted beyond this many, so a public server's memory stays bounded
const MAX_ENTRIES = 5000;
const MAX_UNUSED_MS = 30 * 24 * 60 * 60 * 1000;
const SAVE_DEBOUNCE_MS = 5000;

// Removes markup that differs between page loads without changing what the element is,
// so the same component produces the same cache key on every request.
export function normalizeHtml(html: string): string {
    return html
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\s(?:data-caal-[\w-]+|nonce)="[^"]*"/g, '')
        .replace(/:r[0-9a-z]+:|«r[0-9a-z]+»|_r_[0-9a-z]+_/g, ':id:') // React useId() values
        .replace(/\s+/g, ' ')
        .replace(/>\s+</g, '><')
        .trim();
}

export function cacheKey(model: string, promptVersion: string, elementHtml: string, parentHtml: string): string {
    return crypto
        .createHash('sha256')
        .update(JSON.stringify([promptVersion, model, normalizeHtml(elementHtml), normalizeHtml(parentHtml)]))
        .digest('hex');
}

export function isVerdict(value: any): value is Verdict {
    const optionalString = (v: unknown) => v === null || typeof v === 'string';
    return (
        typeof value === 'object' && value !== null &&
        typeof value.isAccessible === 'boolean' &&
        optionalString(value.issueTitle) &&
        optionalString(value.explanation) &&
        optionalString(value.suggestedFixCode) &&
        optionalString(value.fixReasoning)
    );
}

export class VerdictCache {
    // Map preserves insertion order; re-inserting on use keeps the least recently used entry first
    private entries = new Map<string, CacheEntry>();
    private saveTimer: NodeJS.Timeout | null = null;

    // filePath === null keeps the cache in memory only
    constructor(private filePath: string | null) {
        if (!filePath || !fs.existsSync(filePath)) return;
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            const cutoff = Date.now() - MAX_UNUSED_MS;
            const loaded = Object.entries<CacheEntry>(data.entries || {})
                .filter(([, entry]) => isVerdict(entry.verdict) && entry.lastUsed >= cutoff)
                .sort(([, a], [, b]) => a.lastUsed - b.lastUsed);
            for (const [key, entry] of loaded) {
                this.entries.set(key, { ...entry, analyzedAt: entry.analyzedAt ?? 0 });
            }
            this.evict();
            console.log(`Loaded ${this.entries.size} cached verdicts from ${filePath}`);
        } catch {
            console.warn(`[WARN] Ignoring unreadable cache file: ${filePath}`);
        }
    }

    get(key: string): { verdict: Verdict; analyzedAt: number } | undefined {
        const entry = this.entries.get(key);
        if (!entry) return undefined;
        if (Date.now() - entry.lastUsed > MAX_UNUSED_MS) {
            this.entries.delete(key);
            return undefined;
        }
        entry.lastUsed = Date.now();
        this.entries.delete(key);
        this.entries.set(key, entry);
        return { verdict: entry.verdict, analyzedAt: entry.analyzedAt };
    }

    set(key: string, verdict: Verdict, analyzedAt: number) {
        this.entries.delete(key);
        this.entries.set(key, { verdict, analyzedAt, lastUsed: Date.now() });
        this.evict();
        this.scheduleSave();
    }

    private evict() {
        while (this.entries.size > MAX_ENTRIES) {
            const oldest = this.entries.keys().next().value as string;
            this.entries.delete(oldest);
        }
    }

    private scheduleSave() {
        if (!this.filePath || this.saveTimer) return;
        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            this.save();
        }, SAVE_DEBOUNCE_MS);
    }

    save() {
        if (!this.filePath) return;
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            // Write to a temp file and rename so a crash never leaves a half-written cache
            const tmpPath = `${this.filePath}.tmp`;
            fs.writeFileSync(tmpPath, JSON.stringify({ version: 1, entries: Object.fromEntries(this.entries) }));
            fs.renameSync(tmpPath, this.filePath);
        } catch (error) {
            console.warn(`[WARN] Could not save verdict cache: ${error}`);
        }
    }
}
