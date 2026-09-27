export interface AnalyzeRequest {
    elementHtml: string;
    parentHtml: string;
    pageUrl?: string;
    noCache?: boolean; // skip the cached verdict and ask the model again (the new verdict replaces the cached one)
}

export interface Verdict {
    isAccessible: boolean;
    issueTitle: string | null;
    explanation: string | null;
    suggestedFixCode: string | null;
    fixReasoning: string | null;
}

export interface AnalyzeResponse extends Verdict {
    cached: boolean;
    // How long ago the LLM produced this verdict (relative, so client and server clocks don't need to agree).
    // Lets clients discard verdicts older than their own cache clear.
    ageMs: number;
}
