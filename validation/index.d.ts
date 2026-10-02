export interface ContentDiagnostic { code: string; path: string; severity: 'error'; message: string }
export type ContentValidationResult = {valid:true;diagnostics:[]} | {valid:false;diagnostics:ContentDiagnostic[]};
export declare function validateContent(input: unknown): ContentValidationResult;
