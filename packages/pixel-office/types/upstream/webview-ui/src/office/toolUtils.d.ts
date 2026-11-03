export declare function extractToolName(status: string): string | null;
export declare function setProviderCapabilities(caps: {
    readingTools: string[];
    subagentToolNames: string[];
}): void;
export declare function isReadingToolName(name: string | null | undefined): boolean;
export declare function isSubagentToolName(name: string | null | undefined): boolean;
