/**
 * Audit log activity summary for the doctor command.
 */
import type { ActivitySummary } from './types.ts';
export declare function getActivitySummary(days?: number, logsDir?: string): ActivitySummary;
