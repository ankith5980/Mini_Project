import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface Verdict {
    isAccessible: boolean;
    issueTitle: string | null;
    explanation: string | null;
    suggestedFixCode: string | null;
    fixReasoning: string | null;
}

interface CacheEntry {
    verdict: Verdict;
    lastUsed: string; // YYYY-MM-DD, day granularity so a committed cache file doesn't churn on every run
}

interface CacheFile {
    version: 1;
    entries: Record<string, CacheEntry>;
}

// Entries not used for this long are dropped on save (their element most likely changed or was removed)
const MAX_UNUSED_DAYS = 30;

const today = () => new Date().toISOString().slice(0, 10);

// Removes markup that differs between page loads without changing what the element is,
// so the same component produces the same cache key on every run.
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
    private entries: Record<string, CacheEntry> = {};
    private dirty = false;

    // filePath === null disables persistence (the cache then only dedupes within a single run)
    constructor(private filePath: string | null) {
        if (!filePath || !fs.existsSync(filePath)) return;
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as CacheFile;
            if (data.version === 1 && data.entries) {
                this.entries = data.entries;
            }
        } catch {
            console.warn(`[WARN] Ignoring unreadable cache file: ${filePath}`);
        }
    }

    get size(): number {
        return Object.keys(this.entries).length;
    }

    get(key: string): Verdict | undefined {
        const entry = this.entries[key];
        if (!entry || !isVerdict(entry.verdict)) return undefined;
        if (entry.lastUsed !== today()) {
            entry.lastUsed = today();
            this.dirty = true;
        }
        return entry.verdict;
    }

    set(key: string, verdict: Verdict) {
        this.entries[key] = { verdict, lastUsed: today() };
        this.dirty = true;
    }

    save() {
        if (!this.filePath || !this.dirty) return;

        const cutoff = new Date(Date.now() - MAX_UNUSED_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const sorted: Record<string, CacheEntry> = {};
        for (const key of Object.keys(this.entries).sort()) {
            if (this.entries[key].lastUsed >= cutoff) {
                sorted[key] = this.entries[key];
            }
        }
        this.entries = sorted;

        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        // Write to a temp file and rename so an interrupted run never leaves a half-written cache
        const tmpPath = `${this.filePath}.tmp`;
        fs.writeFileSync(tmpPath, JSON.stringify({ version: 1, entries: sorted } satisfies CacheFile, null, 2) + '\n');
        fs.renameSync(tmpPath, this.filePath);
        this.dirty = false;
    }
}
