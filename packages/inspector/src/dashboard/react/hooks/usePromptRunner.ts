/**
 * usePromptRunner Hook
 *
 * Runs MCP prompts via the dashboard backend.
 * Only available in human mode — backend returns 403 in agent mode.
 */

import { useState, useCallback } from "react";

// =============================================================================
// Types
// =============================================================================

export interface PromptMessage {
  role: "user" | "assistant";
  content: {
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
  };
}

export interface PromptRunResult {
  description?: string;
  messages: PromptMessage[];
}

export interface UsePromptRunnerResult {
  run: (name: string, args: Record<string, string>) => Promise<void>;
  isRunning: boolean;
  lastResult: PromptRunResult | null;
  error: string | null;
}

// =============================================================================
// Hook
// =============================================================================

export function usePromptRunner(
  baseUrl: string,
  connectionId: string | null
): UsePromptRunnerResult {
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<PromptRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (name: string, args: Record<string, string>): Promise<void> => {
      setIsRunning(true);
      setError(null);

      try {
        const res = await fetch(`${baseUrl}/dashboard/get-prompt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(connectionId ? { connectionId } : {}),
            promptName: name,
            arguments: args,
          }),
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }

        const data = (await res.json()) as PromptRunResult;
        setLastResult(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Prompt execution failed");
        setLastResult(null);
      } finally {
        setIsRunning(false);
      }
    },
    [baseUrl, connectionId]
  );

  return { run, isRunning, lastResult, error };
}
