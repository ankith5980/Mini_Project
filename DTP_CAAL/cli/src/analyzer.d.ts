import { ScannedElement } from './scanner';
export interface AnalysisResult extends ScannedElement {
    isAccessible: boolean;
    issueTitle?: string | null;
    explanation?: string | null;
    suggestedFixCode?: string | null;
    fixReasoning?: string | null;
    error?: string;
}
export declare function analyzeElement(element: ScannedElement): Promise<AnalysisResult>;
export declare function analyzeElements(elements: ScannedElement[]): Promise<AnalysisResult[]>;
//# sourceMappingURL=analyzer.d.ts.map