/**
 * MCP Eval Session - Multi-turn conversation support
 *
 * Allows running multiple prompts with maintained conversation history.
 */

import type { MCPEvalResult, MCPEvaluator, TokenUsage } from "./evaluator";
import type { ProviderMessage } from "./providers";

/**
 * A session for multi-turn conversations
 */
export interface MCPSession {
  /** Run a prompt in this session (maintains history automatically) */
  run(prompt: string): Promise<MCPEvalResult>;

  /** Get the current conversation history */
  getHistory(): ProviderMessage[];

  /** Get aggregated token usage for the entire session */
  getUsage(): TokenUsage;

  /** Get all results from this session */
  getResults(): MCPEvalResult[];

  /** Clear history and start fresh */
  reset(): void;

  /** End the session (alias for reset, for semantic clarity) */
  end(): void;
}

/**
 * Create a session for multi-turn conversations
 *
 * @param evaluator - The MCP evaluator to use
 * @returns A session instance
 *
 * @example
 * ```typescript
 * const session = createSession(mcpEval);
 *
 * // First turn
 * const r1 = await session.run("Create a user named Alice");
 *
 * // Second turn (automatically has context from first)
 * const r2 = await session.run("Now greet that user");
 *
 * // Check total usage
 * console.log(session.getUsage().totalTokens);
 *
 * // Clean up
 * session.end();
 * ```
 */
export function createSession(evaluator: MCPEvaluator): MCPSession {
  let history: ProviderMessage[] = [];
  let results: MCPEvalResult[] = [];
  let aggregatedUsage: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  return {
    async run(prompt: string): Promise<MCPEvalResult> {
      // Run with current history
      const result = await evaluator.run(prompt, { history });

      // Update history from result
      history = result.history;

      // Track result
      results.push(result);

      // Aggregate usage
      if (result.usage) {
        aggregatedUsage.promptTokens += result.usage.promptTokens;
        aggregatedUsage.completionTokens += result.usage.completionTokens;
        aggregatedUsage.totalTokens += result.usage.totalTokens;

        // Update estimated cost (sum all costs)
        if (result.usage.estimatedCost) {
          const currentCost = parseFloat(
            aggregatedUsage.estimatedCost?.replace(/[$¢]/g, "") ?? "0"
          );
          const newCost = parseFloat(result.usage.estimatedCost.replace(/[$¢]/g, ""));
          const isCents = result.usage.estimatedCost.includes("¢");
          const totalCost = currentCost + (isCents ? newCost / 100 : newCost);
          aggregatedUsage.estimatedCost = `$${totalCost.toFixed(4)}`;
        }
      }

      return result;
    },

    getHistory(): ProviderMessage[] {
      return [...history];
    },

    getUsage(): TokenUsage {
      return { ...aggregatedUsage };
    },

    getResults(): MCPEvalResult[] {
      return [...results];
    },

    reset(): void {
      history = [];
      results = [];
      aggregatedUsage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      };
    },

    end(): void {
      this.reset();
    },
  };
}
