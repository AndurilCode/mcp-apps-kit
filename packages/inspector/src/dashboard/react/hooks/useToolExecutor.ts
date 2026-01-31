/**
 * useToolExecutor Hook
 *
 * Executes MCP tools via the dashboard backend.
 * Only available in human mode — backend returns 403 in agent mode.
 */

import { useState, useCallback } from "react";

// =============================================================================
// Types
// =============================================================================

export interface ToolExecutionResult {
  content: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError: boolean;
  duration: number;
}

export interface UseToolExecutorResult {
  execute: (toolName: string, args: Record<string, unknown>) => Promise<void>;
  isExecuting: boolean;
  lastResult: ToolExecutionResult | null;
  error: string | null;
}

// =============================================================================
// Hook
// =============================================================================

export function useToolExecutor(
  baseUrl: string,
  connectionId: string | null
): UseToolExecutorResult {
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastResult, setLastResult] = useState<ToolExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (toolName: string, args: Record<string, unknown>): Promise<void> => {
      setIsExecuting(true);
      setError(null);

      try {
        const res = await fetch(`${baseUrl}/dashboard/execute-tool`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(connectionId ? { connectionId } : {}),
            toolName,
            arguments: args,
          }),
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }

        const data = (await res.json()) as ToolExecutionResult;
        setLastResult(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Tool execution failed");
        setLastResult(null);
      } finally {
        setIsExecuting(false);
      }
    },
    [baseUrl, connectionId]
  );

  return { execute, isExecuting, lastResult, error };
}
