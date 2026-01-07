/**
 * MCP Eval - LLM uses MCP tools to complete tasks
 *
 * This is the correct way to evaluate MCP tools:
 * 1. Give the LLM access to MCP tools
 * 2. Give it a natural language prompt
 * 3. Let it decide which tools to call
 * 4. Assert on the tool calls and results
 */

import { ConfigurationError } from "../../errors";
import { llmLogger } from "../../debug";
import { getReporter, getGlobalCollector } from "./reporter";
import { startTestServer } from "../../server/test-server";
import { createTestClient } from "../../server/test-client";
import {
  createProvider,
  getProviderApiKey,
  getDefaultModel,
  detectProvider,
  type ProviderType,
  type LLMProvider,
  type ProviderMessage,
  type ProviderTool,
} from "./providers";
import { createSession, type MCPSession } from "./session";
import { createResilientWrapper, type ResilienceConfig, type RetryConfig, type RateLimitConfig } from "./retry";
import { wrapWithErrorInjection, type ToolErrorConfig } from "./error-injection";
import { runBatch, type BatchEvalCase, type BatchOptions, type BatchResult } from "./batch";
import type { TestClient, TestServer } from "../../types";

// Type for App from @mcp-apps-kit/core (avoiding direct dependency)
interface App {
  start(options?: { port?: number; transport?: string }): Promise<void>;
  stop?(): Promise<void>;
  handler(): (req: unknown, res: unknown, next: () => void) => void;
}

/**
 * Record of a tool call made by the LLM
 */
export interface ToolCallRecord {
  /** Tool name */
  name: string;
  /** Arguments passed to the tool */
  args: Record<string, unknown>;
  /** Result from the tool */
  result: unknown;
  /** Whether the tool call succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * A single criterion for multi-criteria judging
 */
export interface JudgeCriterion {
  /** Criterion name */
  name: string;
  /** Description of what to evaluate */
  description: string;
  /** Pass threshold (default: 0.7) */
  threshold?: number;
}

/**
 * Options for multi-criteria judging
 */
export interface JudgeOptions {
  /** Array of criteria to evaluate */
  criteria: JudgeCriterion[];
  /** Overall pass threshold (default: 0.7) */
  threshold?: number;
}

/**
 * Result for a single criterion
 */
export interface CriterionJudgeResult {
  /** Criterion name */
  name: string;
  /** Score from 0-1 */
  score: number;
  /** Whether this criterion passed */
  pass: boolean;
  /** Explanation from the judge */
  explanation: string;
}

/**
 * Result of judging a response
 */
export interface JudgeResult {
  /** Whether the response passes the criteria */
  pass: boolean;
  /** Score from 0-1 */
  score: number;
  /** Explanation from the judge */
  explanation: string;
  /** Per-criterion results (for multi-criteria judging) */
  criteria?: Record<string, CriterionJudgeResult>;
}

/**
 * Token usage information
 */
export interface TokenUsage {
  /** Tokens in the prompt */
  promptTokens: number;
  /** Tokens in the completion */
  completionTokens: number;
  /** Total tokens used */
  totalTokens: number;
  /** Estimated cost in USD (approximate) */
  estimatedCost?: string;
}

/**
 * Result of an MCP evaluation
 */
export interface MCPEvalResult {
  /** The prompt given to the LLM */
  prompt: string;
  /** Tool calls made by the LLM */
  toolCalls: ToolCallRecord[];
  /** Final response from the LLM */
  response: string;
  /** Total duration in ms */
  duration: number;
  /** Token usage (if available) */
  usage?: TokenUsage;
  /** Conversation history for multi-turn */
  history: ProviderMessage[];

  /**
   * Judge the agent's response using LLM
   * @param criteria - What to evaluate: either a string description or an object with multiple criteria
   * @returns Judgment result with pass/fail, score, and explanation
   * 
   * @example Single criterion
   * ```typescript
   * const judgment = await result.judge("Response should be friendly");
   * expect(judgment.pass).toBe(true);
   * ```
   * 
   * @example Multiple criteria
   * ```typescript
   * const judgment = await result.judge({
   *   criteria: [
   *     { name: "friendly", description: "Response should be friendly" },
   *     { name: "accurate", description: "Response should mention the name" },
   *   ],
   *   threshold: 0.8,
   * });
   * expect(judgment.pass).toBe(true);
   * expect(judgment.criteria?.friendly.pass).toBe(true);
   * ```
   */
  judge(criteria: string | JudgeOptions): Promise<JudgeResult>;
}

/**
 * Configuration for MCP eval
 */
export interface MCPEvalConfig {
  /** LLM provider to use (default: auto-detect from environment) */
  provider?: ProviderType;
  /** Model to use (default: provider-specific) */
  model?: string;
  /** API key (defaults to provider-specific env var) */
  apiKey?: string;
  /** Maximum tokens for response */
  maxTokens?: number;
  /** System prompt to prepend */
  systemPrompt?: string;
  /** Enable verbose reporting (default: true) */
  verbose?: boolean;
  /** Retry configuration for transient errors */
  retry?: RetryConfig;
  /** Rate limiting configuration */
  rateLimit?: RateLimitConfig;
  /** Timeout per evaluation in ms (default: 60000) */
  timeout?: number;
  /** Mock errors for specific tools (for testing error handling) */
  mockErrors?: Record<string, ToolErrorConfig>;
  /** Custom pricing per 1M tokens (overrides built-in pricing table) */
  pricing?: {
    /** Cost per 1M input tokens in USD */
    input: number;
    /** Cost per 1M output tokens in USD */
    output: number;
  };
}

/**
 * MCP Evaluator - runs prompts through an LLM with MCP tool access
 */
export interface MCPEvaluator {
  /**
   * Run a prompt and let the LLM use MCP tools to complete it
   * @param prompt - The task to complete
   * @param options - Optional run-time options
   */
  run(prompt: string, options?: MCPRunOptions): Promise<MCPEvalResult>;
  
  /**
   * Create a session for multi-turn conversations
   * The session maintains conversation history automatically
   */
  createSession(): MCPSession;
  
  /**
   * Run a batch of evaluations
   * @param cases - Array of evaluation cases
   * @param options - Batch options
   */
  runBatch(cases: BatchEvalCase[], options?: BatchOptions): Promise<BatchResult>;
}

/**
 * Options for a single run
 */
export interface MCPRunOptions {
  /** Previous conversation history for multi-turn */
  history?: ProviderMessage[];
  /** Inject error for a specific tool (one-time, for this run only) */
  injectError?: {
    /** Tool name to inject error for */
    tool: string;
    /** Error message */
    error: string;
  };
}

/**
 * MCP Evaluator with cleanup (returned by setupMCPEval)
 */
export interface MCPEval extends MCPEvaluator {
  /**
   * Cleanup server and client resources
   */
  cleanup(): Promise<void>;
}

/**
 * Configuration for setupMCPEval (simplified setup)
 */
export interface MCPEvalSetupConfig extends MCPEvalConfig {
  /** API version (e.g., "v1", "v2") */
  version?: string;
  /** Server port (default: auto-assigned) */
  port?: number;
}

/**
 * Pricing per 1M tokens
 */
export interface TokenPricing {
  /** Cost per 1M input tokens in USD */
  input: number;
  /** Cost per 1M output tokens in USD */
  output: number;
}

/**
 * Estimate cost based on token usage
 * 
 * @param promptTokens - Number of input tokens
 * @param completionTokens - Number of output tokens
 * @param pricing - Pricing per 1M tokens (required)
 * @returns Formatted cost string, or undefined if no pricing provided
 * 
 * @example
 * ```typescript
 * const mcpEval = await setupMCPEval(app, {
 *   pricing: { input: 0.15, output: 0.6 }, // per 1M tokens
 * });
 * ```
 */
function estimateCost(
  promptTokens: number,
  completionTokens: number,
  pricing?: TokenPricing
): string | undefined {
  if (!pricing) {
    return undefined;
  }

  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
  const totalCost = inputCost + outputCost;

  // Always show in dollars
  if (totalCost < 0.0001) {
    return `$${totalCost.toFixed(6)}`;
  }
  return `$${totalCost.toFixed(4)}`;
}

/**
 * Create an MCP evaluator
 *
 * @param client - Test client connected to MCP server
 * @param config - Evaluator configuration
 * @returns MCP evaluator instance
 *
 * @example
 * ```typescript
 * const client = await createTestClient("http://localhost:3000/v1/mcp");
 * const eval = createMCPEval(client, { model: "gpt-4o-mini" });
 *
 * const result = await eval.run("Greet Alice politely");
 *
 * // Assert on what the LLM did
 * expect(result.toolCalls).toHaveLength(1);
 * expect(result.toolCalls[0].name).toBe("greet");
 * expect(result.toolCalls[0].args.name).toBe("Alice");
 * ```
 */
export function createMCPEval(client: TestClient, config: MCPEvalConfig = {}): MCPEvaluator {
  // Detect provider
  const detectedProvider = config.provider ?? detectProvider();
  if (!detectedProvider) {
    throw new ConfigurationError(
      "provider",
      "No LLM provider configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable, or specify provider in config."
    );
  }
  // Capture in a const with definite type for closure
  const providerType: ProviderType = detectedProvider;

  // Get API key
  const configuredApiKey = config.apiKey ?? getProviderApiKey(providerType);
  if (!configuredApiKey) {
    const envVar = providerType === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
    throw new ConfigurationError(
      envVar,
      `${envVar} environment variable is required for ${providerType} provider`
    );
  }
  // Capture in a const with definite type for closure
  const apiKey: string = configuredApiKey;

  const model = config.model ?? getDefaultModel(providerType);
  const maxTokens = config.maxTokens ?? 1024;
  const timeout = config.timeout ?? 60000;

  llmLogger("Creating MCP evaluator with provider: %s, model: %s", providerType, model);

  // Create resilient wrapper for LLM API calls
  const resilientConfig: ResilienceConfig = {};
  if (config.retry) {
    resilientConfig.retry = config.retry;
  }
  if (config.rateLimit) {
    resilientConfig.rateLimit = config.rateLimit;
  }
  if (timeout) {
    resilientConfig.timeout = timeout;
  }
  const withResilience = createResilientWrapper(resilientConfig);

  // Wrap client with error injection if configured
  const baseClient: TestClient = config.mockErrors
    ? wrapWithErrorInjection(client, { tools: config.mockErrors })
    : client;

  // Provider instance (created lazily)
  let provider: LLMProvider | null = null;

  async function getProvider(): Promise<LLMProvider> {
    if (!provider) {
      provider = await createProvider(providerType, {
        apiKey,
        model,
        maxTokens,
      });
    }
    return provider;
  }

  return {
    async run(prompt: string, options?: MCPRunOptions): Promise<MCPEvalResult> {
      const startTime = Date.now();
      const toolCalls: ToolCallRecord[] = [];
      let totalUsage: TokenUsage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      };

      // Handle per-run error injection
      let runClient: TestClient = baseClient;
      if (options?.injectError) {
        runClient = wrapWithErrorInjection(baseClient, {
          tools: {
            [options.injectError.tool]: {
              error: options.injectError.error,
              probability: 1.0,
              errorCount: 1, // Only error once
            },
          },
        });
      }

      // Get provider instance
      const llm = await getProvider();

      // Get available tools from MCP
      const mcpTools = await runClient.listTools();
      llmLogger(
        "Available MCP tools: %o",
        mcpTools.map((t) => ({ name: t.name, schema: t.inputSchema }))
      );

      // Convert MCP tools to provider format
      const providerTools: ProviderTool[] = mcpTools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? `Tool: ${tool.name}`,
        parameters: tool.inputSchema ?? {
          type: "object",
          properties: {},
        },
      }));

      // Build messages (with optional history)
      const messages: ProviderMessage[] = options?.history ? [...options.history] : [];

      if (config.systemPrompt && messages.length === 0) {
        messages.push({ role: "system", content: config.systemPrompt });
      }
      messages.push({ role: "user", content: prompt });

      // Run conversation loop until LLM stops calling tools
      let response = "";
      let iterations = 0;
      const maxIterations = 10; // Safety limit

      while (iterations < maxIterations) {
        iterations++;
        llmLogger("MCP eval iteration %d", iterations);

        const completion = await withResilience(() => 
          llm.createCompletion(messages, providerTools)
        );

        // Track usage
        if (completion.usage) {
          totalUsage.promptTokens += completion.usage.promptTokens;
          totalUsage.completionTokens += completion.usage.completionTokens;
          totalUsage.totalTokens += completion.usage.totalTokens;
        }

        // If there are tool calls, execute them
        if (completion.toolCalls.length > 0) {
          // Add assistant message with tool calls
          messages.push({
            role: "assistant",
            content: completion.content,
            toolCalls: completion.toolCalls,
          });

          // Execute each tool call via MCP
          for (const toolCall of completion.toolCalls) {
            const toolName = toolCall.name;
            const args = toolCall.arguments;

            llmLogger("LLM calling tool: %s with args: %o", toolName, args);

            try {
              const result = await runClient.callTool(toolName, args);

              const record: ToolCallRecord = {
                name: toolName,
                args,
                result: result.structuredContent ?? result.content,
                success: !result.isError,
                error: result.isError
                  ? String(result.content?.[0]?.text ?? "Unknown error")
                  : undefined,
              };
              toolCalls.push(record);

              // Add tool result to messages
              messages.push({
                role: "tool",
                toolCallId: toolCall.id,
                content: JSON.stringify(result.structuredContent ?? result.content),
              });

              llmLogger("Tool %s result: %o", toolName, record);
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : String(err);

              toolCalls.push({
                name: toolName,
                args,
                result: null,
                success: false,
                error: errorMsg,
              });

              messages.push({
                role: "tool",
                toolCallId: toolCall.id,
                content: JSON.stringify({ error: errorMsg }),
              });
            }
          }
        } else {
          // No tool calls, we have the final response
          response = completion.content;
          // Add final assistant message to history
          messages.push({
            role: "assistant",
            content: response,
          });
          break;
        }
      }

      const duration = Date.now() - startTime;

      // Calculate estimated cost (only if pricing is configured)
      if (totalUsage.totalTokens > 0 && config.pricing) {
        totalUsage.estimatedCost = estimateCost(
          totalUsage.promptTokens,
          totalUsage.completionTokens,
          config.pricing
        );
      }

      // Report the result
      const reporter = getReporter(config.verbose ?? true);
      reporter.reportResult(prompt, toolCalls, response, duration, totalUsage);

      // Collect for global summary (tracks all runs, even without judge)
      const collector = getGlobalCollector();
      const collectedResult = {
        prompt,
        toolCalls,
        response,
        duration,
        usage: totalUsage.totalTokens > 0 ? totalUsage : undefined,
        judgeResult: undefined as JudgeResult | undefined,
      };
      collector.add(collectedResult);

      return {
        prompt,
        toolCalls,
        response,
        duration,
        usage: totalUsage.totalTokens > 0 ? totalUsage : undefined,
        history: messages,

        // Judge method - evaluates the agent's response
        async judge(criteriaInput: string | JudgeOptions): Promise<JudgeResult> {
          // Handle string criteria (simple case)
          if (typeof criteriaInput === "string") {
            llmLogger("Judging response with criteria: %s", criteriaInput);

            const judgePrompt = `You are an evaluation judge. Evaluate the following agent interaction.

TASK GIVEN TO AGENT:
${prompt}

TOOLS CALLED BY AGENT:
${toolCalls.map((tc) => `- ${tc.name}(${JSON.stringify(tc.args)}) → ${JSON.stringify(tc.result)}`).join("\n")}

AGENT'S FINAL RESPONSE:
${response}

EVALUATION CRITERIA:
${criteriaInput}

Evaluate whether the agent successfully completed the task according to the criteria.
Respond with JSON: { "pass": boolean, "score": 0.0-1.0, "explanation": "..." }`;

            const judgeResult = await withResilience(() =>
              llm.createJSONCompletion([{ role: "user", content: judgePrompt }])
            );

            // Track judge usage
            if (judgeResult.usage) {
              totalUsage.promptTokens += judgeResult.usage.promptTokens;
              totalUsage.completionTokens += judgeResult.usage.completionTokens;
              totalUsage.totalTokens += judgeResult.usage.totalTokens;
            }

            let result: JudgeResult;
            try {
              const parsed = JSON.parse(judgeResult.content) as {
                pass: boolean;
                score: number;
                explanation: string;
              };
              result = {
                pass: parsed.pass,
                score: parsed.score,
                explanation: parsed.explanation,
              };
            } catch {
              // If JSON parsing fails, try to extract values
              result = {
                pass: judgeResult.content.toLowerCase().includes("pass"),
                score: 0.5,
                explanation: judgeResult.content,
              };
            }

            // Report the judgment
            reporter.reportJudgment(result);

            // Update collected result with judge result
            collectedResult.judgeResult = result;

            return result;
          }

          // Handle multi-criteria judging
          llmLogger("Judging response with %d criteria", criteriaInput.criteria.length);

          const criteriaList = criteriaInput.criteria
            .map((c, i) => `${i + 1}. ${c.name}: ${c.description}`)
            .join("\n");

          const multiJudgePrompt = `You are an evaluation judge. Evaluate the following agent interaction against MULTIPLE criteria.

TASK GIVEN TO AGENT:
${prompt}

TOOLS CALLED BY AGENT:
${toolCalls.map((tc) => `- ${tc.name}(${JSON.stringify(tc.args)}) → ${JSON.stringify(tc.result)}`).join("\n")}

AGENT'S FINAL RESPONSE:
${response}

EVALUATION CRITERIA:
${criteriaList}

Evaluate each criterion independently.
Respond with JSON: {
  "criteria": [
    { "name": "criterion_name", "score": 0.0-1.0, "explanation": "..." },
    ...
  ],
  "overall": { "score": 0.0-1.0, "explanation": "overall assessment" }
}`;

          const judgeResult = await withResilience(() =>
            llm.createJSONCompletion([{ role: "user", content: multiJudgePrompt }])
          );

          // Track judge usage
          if (judgeResult.usage) {
            totalUsage.promptTokens += judgeResult.usage.promptTokens;
            totalUsage.completionTokens += judgeResult.usage.completionTokens;
            totalUsage.totalTokens += judgeResult.usage.totalTokens;
          }

          let result: JudgeResult;
          try {
            const parsed = JSON.parse(judgeResult.content) as {
              criteria: Array<{ name: string; score: number; explanation: string }>;
              overall: { score: number; explanation: string };
            };

            // Build per-criterion results
            const criteriaResults: Record<string, CriterionJudgeResult> = {};
            const overallThreshold = criteriaInput.threshold ?? 0.7;

            for (const criterion of criteriaInput.criteria) {
              const parsedCriterion = parsed.criteria.find((c) => c.name === criterion.name);
              const threshold = criterion.threshold ?? 0.7;
              const score = parsedCriterion?.score ?? 0;

              criteriaResults[criterion.name] = {
                name: criterion.name,
                score,
                pass: score >= threshold,
                explanation: parsedCriterion?.explanation ?? "No evaluation provided",
              };
            }

            // Calculate overall pass
            const overallScore = parsed.overall.score;
            const allCriteriaPassed = Object.values(criteriaResults).every((c) => c.pass);

            result = {
              pass: overallScore >= overallThreshold && allCriteriaPassed,
              score: overallScore,
              explanation: parsed.overall.explanation,
              criteria: criteriaResults,
            };
          } catch {
            // If JSON parsing fails, return failure
            result = {
              pass: false,
              score: 0,
              explanation: `Failed to parse judge response: ${judgeResult.content}`,
            };
          }

          // Report the judgment
          reporter.reportJudgment(result);

          // Update collected result with judge result
          collectedResult.judgeResult = result;

          return result;
        },
      };
    },
    
    createSession(): MCPSession {
      // The 'this' here refers to the MCPEvaluator we're creating
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const self = this as MCPEvaluator;
      return createSession(self);
    },
    
    runBatch(cases: BatchEvalCase[], options?: BatchOptions): Promise<BatchResult> {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const self = this as MCPEvaluator;
      return runBatch(self, cases, options);
    },
  };
}

/**
 * Check if OpenAI API key is available
 */
export function hasOpenAIKey(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/**
 * Check if Anthropic API key is available
 */
export function hasAnthropicKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Check if any LLM provider key is available
 */
export function hasAnyProviderKey(): boolean {
  return hasOpenAIKey() || hasAnthropicKey();
}

type DescribeFn = (name: string, fn: () => void) => void;
type DescribeWithSkip = DescribeFn & { skip: DescribeFn };

/**
 * A describe function that auto-skips if no LLM provider key is available.
 *
 * Works with both Vitest and Jest. Import and use directly as a replacement for `describe`.
 *
 * @example
 * ```typescript
 * import { describeEval, setupMCPEval } from "@mcp-apps-kit/testing";
 *
 * describeEval("MCP Eval Tests", () => {
 *   // Tests will be skipped if no LLM provider key is set
 * });
 * ```
 */
export const describeEval: DescribeWithSkip = Object.assign(
  (name: string, fn: () => void) => {
    // Try to get describe from global (works in Vitest and Jest)
    const globalDescribe = (globalThis as Record<string, unknown>).describe as
      | DescribeWithSkip
      | undefined;

    if (!globalDescribe) {
      console.warn("[describeEval] No test framework detected. Skipping:", name);
      return;
    }

    if (hasAnyProviderKey()) {
      globalDescribe(name, fn);
    } else {
      globalDescribe.skip(name, fn);
    }
  },
  {
    skip: (name: string, fn: () => void) => {
      const globalDescribe = (globalThis as Record<string, unknown>).describe as
        | DescribeWithSkip
        | undefined;
      if (globalDescribe) {
        globalDescribe.skip(name, fn);
      }
    },
  }
);

/**
 * Setup MCP evaluation from an app (simplified API)
 *
 * This handles all the server/client setup automatically.
 *
 * @param app - Your MCP app instance
 * @param config - Configuration options
 * @returns MCP evaluator with cleanup function
 *
 * @example
 * ```typescript
 * const mcpEval = await setupMCPEval(app, { version: "v1" });
 *
 * const result = await mcpEval.run("Please greet Alice");
 * expect(result.toolCalls[0].args.name).toBe("Alice");
 *
 * const judgment = await result.judge("Should be friendly");
 * expect(judgment.pass).toBe(true);
 *
 * await mcpEval.cleanup();
 * ```
 */
export async function setupMCPEval(app: App, config: MCPEvalSetupConfig = {}): Promise<MCPEval> {
  // Use random port if not specified
  const port = config.port ?? Math.floor(3100 + Math.random() * 900);

  // Start server
  const server: TestServer = await startTestServer(app, { port });

  // Wait for server to be ready
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Build URL with version if specified
  const baseUrl = `http://localhost:${port}`;
  const mcpUrl = config.version ? `${baseUrl}/${config.version}/mcp` : `${baseUrl}/mcp`;

  // Create client
  const client: TestClient = await createTestClient(mcpUrl, {
    trackHistory: true,
  });

  // Create the evaluator (pass all config except port/version which were already used)
  const { port: _port, version: _version, ...evalConfig } = config;
  const evaluator = createMCPEval(client, evalConfig);

  // Add cleanup function
  const cleanup = async () => {
    await client.disconnect();
    await server.stop();
  };

  return {
    ...evaluator,
    cleanup,
  };
}
