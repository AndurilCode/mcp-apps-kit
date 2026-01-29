/**
 * History Types
 *
 * Types for call history tracking and reporting.
 */

import type { ContentBlock } from "./tool-types";

// =============================================================================
// HISTORY TYPES
// =============================================================================

/**
 * A recorded tool call
 */
export interface HistoryEntry {
  name: string;
  args: Record<string, unknown>;
  result: {
    content: ContentBlock[];
    isError: boolean;
  };
  duration: number;
  timestamp: string;
}

/**
 * Output from get_call_history
 */
export interface HistoryOutput {
  history: HistoryEntry[];
  totalCalls: number;
  errorCount: number;
  averageDuration: number;
  message?: string;
}

/**
 * Output from clear_history
 */
export interface ClearHistoryOutput {
  cleared: boolean;
  previousCount: number;
}
