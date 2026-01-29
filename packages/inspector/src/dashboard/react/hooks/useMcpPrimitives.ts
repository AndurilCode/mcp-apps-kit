/**
 * useMcpPrimitives Hook
 *
 * Polls the inspector backend for MCP primitives (tools, resources, prompts).
 */

import { useState, useEffect, useCallback } from "react";
import type { McpTool, McpResource, McpPrompt, McpPrimitives } from "../types/mcp-primitives";

// Re-export types for convenience
export type { McpTool, McpResource, McpPrompt, McpPrimitives };

interface PrimitivesResponse {
  tools?: McpTool[];
  resources?: McpResource[];
  prompts?: McpPrompt[];
}

export interface UseMcpPrimitivesResult {
  tools: McpTool[];
  resources: McpResource[];
  prompts: McpPrompt[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useMcpPrimitives(
  baseUrl: string,
  isConnected: boolean,
  pollInterval = 30000
): UseMcpPrimitivesResult {
  const [primitives, setPrimitives] = useState<McpPrimitives | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasConnected, setWasConnected] = useState(false);

  const fetchPrimitives = useCallback(async () => {
    try {
      const res = await fetch(`${baseUrl}/mcp/primitives`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as PrimitivesResponse;
      setPrimitives({
        tools: data.tools ?? [],
        resources: data.resources ?? [],
        prompts: data.prompts ?? [],
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch MCP primitives");
    } finally {
      setIsLoading(false);
    }
  }, [baseUrl]);

  // Refresh immediately when connection is established
  useEffect(() => {
    if (isConnected && !wasConnected) {
      setIsLoading(true);
      void fetchPrimitives();
    }
    setWasConnected(isConnected);
  }, [isConnected, wasConnected, fetchPrimitives]);

  useEffect(() => {
    if (!isConnected) {
      return;
    }
    const interval = setInterval(() => {
      void fetchPrimitives();
    }, pollInterval);
    return () => {
      clearInterval(interval);
    };
  }, [fetchPrimitives, pollInterval, isConnected]);

  return {
    tools: primitives?.tools ?? [],
    resources: primitives?.resources ?? [],
    prompts: primitives?.prompts ?? [],
    isLoading,
    error,
    refresh: fetchPrimitives,
  };
}
