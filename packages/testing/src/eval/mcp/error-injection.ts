/**
 * Error Injection for MCP Eval
 *
 * Allows testing how LLMs handle tool errors gracefully.
 */

import type { TestClient, ToolResult } from "../../types";

/**
 * Configuration for error injection on a specific tool
 */
export interface ToolErrorConfig {
  /** Error message to return */
  error: string;
  /** Probability of error (0-1, default: 1.0 = always error) */
  probability?: number;
  /** Number of times to error before succeeding (for testing retries) */
  errorCount?: number;
  /** Whether to throw an exception vs return an error result */
  throwException?: boolean;
}

/**
 * Configuration for the error-injecting wrapper
 */
export interface ErrorInjectionConfig {
  /** Tool-specific error configurations */
  tools?: Record<string, ToolErrorConfig>;
  /** Global error probability (applies to all tools not specifically configured) */
  globalErrorProbability?: number;
  /** Global error message */
  globalError?: string;
}

/**
 * Runtime error injection state
 */
export interface ErrorInjectionState {
  callCounts: Map<string, number>;
}

/**
 * Extended TestClient with error injection reset capability
 */
export interface TestClientWithReset extends TestClient {
  /**
   * Reset error injection state (clears call counts).
   * Useful for testing retry scenarios.
   */
  reset(): void;
}

/**
 * Wrap a TestClient with error injection capabilities
 *
 * @param client - The original test client
 * @param config - Error injection configuration
 * @returns A wrapped client that can inject errors and be reset
 *
 * @example
 * ```typescript
 * const wrappedClient = wrapWithErrorInjection(client, {
 *   tools: {
 *     greet: { error: "Service unavailable", probability: 0.5 }
 *   }
 * });
 *
 * // Later, reset the error injection state
 * wrappedClient.reset();
 * ```
 */
export function wrapWithErrorInjection(
  client: TestClient,
  config: ErrorInjectionConfig
): TestClientWithReset {
  const state: ErrorInjectionState = {
    callCounts: new Map(),
  };

  return {
    // Delegate all read-only methods
    get raw() {
      return client.raw;
    },
    listTools: () => client.listTools(),
    listResources: () => client.listResources(),
    readResource: (uri: string) => client.readResource(uri),
    listPrompts: () => client.listPrompts(),
    getPrompt: (name: string, args?: Record<string, string>) => client.getPrompt(name, args),
    getCallHistory: () => client.getCallHistory(),
    clearHistory: () => {
      client.clearHistory();
    },
    disconnect: () => client.disconnect(),

    // Reset error injection state
    reset(): void {
      state.callCounts.clear();
    },

    // Wrap callTool with error injection
    async callTool(name: string, args: unknown): Promise<ToolResult> {
      // Track call count
      const currentCount = state.callCounts.get(name) ?? 0;
      state.callCounts.set(name, currentCount + 1);

      // Check for tool-specific error config
      const toolConfig = config.tools?.[name];

      if (toolConfig) {
        // Check if we should still error based on errorCount
        if (toolConfig.errorCount !== undefined && currentCount >= toolConfig.errorCount) {
          // We've errored enough times, let the call through
          return client.callTool(name, args);
        }

        // Check probability
        const probability = toolConfig.probability ?? 1.0;
        if (Math.random() < probability) {
          // Inject error
          if (toolConfig.throwException) {
            throw new Error(toolConfig.error);
          }
          return {
            content: [{ type: "text", text: toolConfig.error }],
            isError: true,
          };
        }
      } else if (config.globalErrorProbability !== undefined) {
        // Check global error probability
        if (Math.random() < config.globalErrorProbability) {
          const error = config.globalError ?? "Simulated error";
          return {
            content: [{ type: "text", text: error }],
            isError: true,
          };
        }
      }

      // No error injection, proceed normally
      return client.callTool(name, args);
    },
  };
}

/**
 * Options for per-run error injection
 */
export interface RunErrorInjectionOptions {
  /** Inject error for specific tool call */
  injectError?: {
    /** Tool name to inject error for */
    tool: string;
    /** Error message */
    error: string;
    /** Whether to throw exception vs return error result */
    throwException?: boolean;
  };
}

/**
 * Create a single-use error injector for a specific run
 *
 * @param options - Error injection options for this run
 * @returns An error injection config for a single tool call
 */
export function createRunErrorConfig(
  options: RunErrorInjectionOptions
): ErrorInjectionConfig | undefined {
  if (!options.injectError) {
    return undefined;
  }

  return {
    tools: {
      [options.injectError.tool]: {
        error: options.injectError.error,
        probability: 1.0,
        errorCount: 1, // Only error once
        throwException: options.injectError.throwException,
      },
    },
  };
}
