"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerdictCache = void 0;
exports.normalizeHtml = normalizeHtml;
exports.cacheKey = cacheKey;
exports.isVerdict = isVerdict;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Entries not used for this long are dropped on save (their element most likely changed or was removed)
const MAX_UNUSED_DAYS = 30;
const today = () => new Date().toISOString().slice(0, 10);
// Removes markup that differs between page loads without changing what the element is,
// so the same component produces the same cache key on every run.
function normalizeHtml(html) {
    return html
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\s(?:data-caal-[\w-]+|nonce)="[^"]*"/g, '')
        .replace(/:r[0-9a-z]+:|«r[0-9a-z]+»|_r_[0-9a-z]+_/g, ':id:') // React useId() values
        .replace(/\s+/g, ' ')
        .replace(/>\s+</g, '><')
        .trim();
}
function cacheKey(model, promptVersion, elementHtml, parentHtml) {
    return crypto_1.default
        .createHash('sha256')
        .update(JSON.stringify([promptVersion, model, normalizeHtml(elementHtml), normalizeHtml(parentHtml)]))
        .digest('hex');
}
function isVerdict(value) {
    const optionalString = (v) => v === null || typeof v === 'string';
    return (typeof value === 'object' && value !== null &&
        typeof value.isAccessible === 'boolean' &&
        optionalString(value.issueTitle) &&
        optionalString(value.explanation) &&
        optionalString(value.suggestedFixCode) &&
        optionalString(value.fixReasoning));
}
class VerdictCache {
    // filePath === null disables persistence (the cache then only dedupes within a single run)
    constructor(filePath) {
        this.filePath = filePath;
        this.entries = {};
        this.dirty = false;
        if (!filePath || !fs_1.default.existsSync(filePath))
            return;
        try {
            const data = JSON.parse(fs_1.default.readFileSync(filePath, 'utf-8'));
            if (data.version === 1 && data.entries) {
                this.entries = data.entries;
            }
        }
        catch {
            console.warn(`[WARN] Ignoring unreadable cache file: ${filePath}`);
        }
    }
    get size() {
        return Object.keys(this.entries).length;
    }
    get(key) {
        const entry = this.entries[key];
        if (!entry || !isVerdict(entry.verdict))
            return undefined;
        if (entry.lastUsed !== today()) {
            entry.lastUsed = today();
            this.dirty = true;
        }
        return entry.verdict;
    }
    set(key, verdict) {
        this.entries[key] = { verdict, lastUsed: today() };
        this.dirty = true;
    }
    save() {
        if (!this.filePath || !this.dirty)
            return;
        const cutoff = new Date(Date.now() - MAX_UNUSED_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const sorted = {};
        for (const key of Object.keys(this.entries).sort()) {
            if (this.entries[key].lastUsed >= cutoff) {
                sorted[key] = this.entries[key];
            }
        }
        this.entries = sorted;
        const dir = path_1.default.dirname(this.filePath);
        if (!fs_1.default.existsSync(dir)) {
            fs_1.default.mkdirSync(dir, { recursive: true });
        }
        // Write to a temp file and rename so an interrupted run never leaves a half-written cache
        const tmpPath = `${this.filePath}.tmp`;
        fs_1.default.writeFileSync(tmpPath, JSON.stringify({ version: 1, entries: sorted }, null, 2) + '\n');
        fs_1.default.renameSync(tmpPath, this.filePath);
        this.dirty = false;
    }
}
exports.VerdictCache = VerdictCache;
