export interface ScannedElement {
    id: string;
    tagName: string;
    elementHtml: string;
    parentHtml: string;
}
export declare function scanPage(url: string): Promise<ScannedElement[]>;
//# sourceMappingURL=scanner.d.ts.map