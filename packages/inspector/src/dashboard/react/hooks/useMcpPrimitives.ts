/**
 * useMcpPrimitives Hook
 *
 * Polls the inspector backend for MCP primitives (tools, resources, prompts).
 */

import { useState, useEffect, useCallback } from "react";

export interface McpToolInputSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: McpToolInputSchema;
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface McpPrimitives {
  tools: McpTool[];
  resources: McpResource[];
  prompts: McpPrompt[];
}

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

export function useMcpPrimitives(baseUrl: string, pollInterval = 30000): UseMcpPrimitivesResult {
  const [primitives, setPrimitives] = useState<McpPrimitives | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    void fetchPrimitives();
    const interval = setInterval(() => {
      void fetchPrimitives();
    }, pollInterval);
    return () => {
      clearInterval(interval);
    };
  }, [fetchPrimitives, pollInterval]);

  return {
    tools: primitives?.tools ?? [],
    resources: primitives?.resources ?? [],
    prompts: primitives?.prompts ?? [],
    isLoading,
    error,
    refresh: fetchPrimitives,
  };
}
