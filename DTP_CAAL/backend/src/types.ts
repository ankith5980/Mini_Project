export interface AnalyzeRequest {
    elementHtml: string;
    parentHtml: string;
    pageUrl?: string;
}

export interface AnalyzeResponse {
    isAccessible: boolean;
    issueTitle?: string;
    explanation?: string;
    suggestedFixCode?: string;
    fixReasoning?: string;
}
