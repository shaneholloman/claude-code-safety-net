/**
 * CLI flag parsing for the explain command.
 */
export interface ExplainFlags {
    json: boolean;
    cwd?: string;
    command: string;
}
export declare function parseExplainFlags(args: string[]): ExplainFlags | null;
