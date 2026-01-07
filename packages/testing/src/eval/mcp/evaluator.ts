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
import { createLazyLoader } from "../../utils/lazy-loader";
import { getReporter } from "./reporter";
import { startTestServer } from "../../server/test-server";
import { createTestClient } from "../../server/test-client";
import type { TestClient, TestServer } from "../../types";

// Type for App from @mcp-apps-kit/core (avoiding direct dependency)
interface App {
  start(options?: { port?: number; transport?: string }): Promise<void>;
  stop?(): Promise<void>;
  handler(): (req: unknown, res: unknown, next: () => void) => void;
}

/**
 * Lazy loader for OpenAI module
 */
const getOpenAI = createLazyLoader(() => import("openai"), {
  packageName: "openai",
  installHint: "npm install -D openai",
});

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
 * Result of judging a response
 */
export interface JudgeResult {
  /** Whether the response passes the criteria */
  pass: boolean;
  /** Score from 0-1 */
  score: number;
  /** Explanation from the judge */
  explanation: string;
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
  
  /**
   * Judge the agent's response using LLM
   * @param criteria - What to evaluate (e.g., "Response should be polite and include the person's name")
   * @returns Judgment result with pass/fail, score, and explanation
   */
  judge(criteria: string): Promise<JudgeResult>;
}

/**
 * Configuration for MCP eval
 */
export interface MCPEvalConfig {
  /** OpenAI model to use */
  model?: string;
  /** OpenAI API key (defaults to OPENAI_API_KEY env var) */
  apiKey?: string;
  /** Maximum tokens for response */
  maxTokens?: number;
  /** System prompt to prepend */
  systemPrompt?: string;
  /** Enable verbose reporting (default: true) */
  verbose?: boolean;
}

/**
 * MCP Evaluator - runs prompts through an LLM with MCP tool access
 */
export interface MCPEvaluator {
  /**
   * Run a prompt and let the LLM use MCP tools to complete it
   */
  run(prompt: string): Promise<MCPEvalResult>;
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
  const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ConfigurationError(
      "OPENAI_API_KEY",
      "OPENAI_API_KEY environment variable is required for MCP evaluation"
    );
  }

  const model = config.model ?? "gpt-4o-mini";
  const maxTokens = config.maxTokens ?? 1024;

  llmLogger("Creating MCP evaluator with model: %s", model);

  return {
    async run(prompt: string): Promise<MCPEvalResult> {
      const startTime = Date.now();
      const toolCalls: ToolCallRecord[] = [];

      // Get available tools from MCP (includes inputSchema)
      const mcpTools = await client.listTools();
      llmLogger("Available MCP tools: %o", mcpTools.map((t) => ({ name: t.name, schema: t.inputSchema })));

      // Convert MCP tools to OpenAI function format
      // MCP inputSchema is JSON Schema format, which OpenAI accepts directly
      const openaiTools = mcpTools.map((tool) => ({
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description ?? `Tool: ${tool.name}`,
          // Use the MCP inputSchema directly - it's already JSON Schema format
          parameters: tool.inputSchema ?? {
            type: "object" as const,
            properties: {} as Record<string, unknown>,
          },
        },
      }));

      // Create OpenAI client
      const openaiModule = await getOpenAI();
      const OpenAIClass = openaiModule.default ?? openaiModule.OpenAI ?? openaiModule;
      const openai = new (OpenAIClass as new (opts: { apiKey: string }) => import("openai").OpenAI)({
        apiKey,
      });

      // Build messages
      const messages: Array<{
        role: "system" | "user" | "assistant" | "tool";
        content: string;
        tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
        tool_call_id?: string;
      }> = [];

      if (config.systemPrompt) {
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

        const completion = await openai.chat.completions.create({
          model,
          max_tokens: maxTokens,
          messages: messages as Parameters<typeof openai.chat.completions.create>[0]["messages"],
          tools: openaiTools.length > 0 ? openaiTools : undefined,
        });

        const choice = completion.choices[0];
        if (!choice) {
          throw new Error("No response from OpenAI");
        }

        const assistantMessage = choice.message;

        // If there are tool calls, execute them
        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
          // Add assistant message with tool calls
          messages.push({
            role: "assistant",
            content: assistantMessage.content ?? "",
            tool_calls: assistantMessage.tool_calls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments,
              },
            })),
          });

          // Execute each tool call via MCP
          for (const toolCall of assistantMessage.tool_calls) {
            const toolName = toolCall.function.name;
            let args: Record<string, unknown> = {};
            
            try {
              args = JSON.parse(toolCall.function.arguments);
            } catch {
              args = {};
            }

            llmLogger("LLM calling tool: %s with args: %o", toolName, args);

            try {
              const result = await client.callTool(toolName, args);
              
              const record: ToolCallRecord = {
                name: toolName,
                args,
                result: result.structuredContent ?? result.content,
                success: !result.isError,
                error: result.isError ? String(result.content?.[0]?.text ?? "Unknown error") : undefined,
              };
              toolCalls.push(record);

              // Add tool result to messages
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
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
                tool_call_id: toolCall.id,
                content: JSON.stringify({ error: errorMsg }),
              });
            }
          }
        } else {
          // No tool calls, we have the final response
          response = assistantMessage.content ?? "";
          break;
        }
      }

      const duration = Date.now() - startTime;

      // Report the result
      const reporter = getReporter(config.verbose ?? true);
      reporter.reportResult(prompt, toolCalls, response, duration);

      return {
        prompt,
        toolCalls,
        response,
        duration,
        
        // Judge method - evaluates the agent's response
        async judge(criteria: string): Promise<JudgeResult> {
          llmLogger("Judging response with criteria: %s", criteria);
          
          const judgePrompt = `You are an evaluation judge. Evaluate the following agent interaction.

TASK GIVEN TO AGENT:
${prompt}

TOOLS CALLED BY AGENT:
${toolCalls.map((tc) => `- ${tc.name}(${JSON.stringify(tc.args)}) → ${JSON.stringify(tc.result)}`).join("\n")}

AGENT'S FINAL RESPONSE:
${response}

EVALUATION CRITERIA:
${criteria}

Evaluate whether the agent successfully completed the task according to the criteria.
Respond with JSON: { "pass": boolean, "score": 0.0-1.0, "explanation": "..." }`;

          const judgeCompletion = await openai.chat.completions.create({
            model,
            max_tokens: 512,
            messages: [{ role: "user", content: judgePrompt }],
            response_format: { type: "json_object" },
          });

          const judgeContent = judgeCompletion.choices[0]?.message?.content;
          if (!judgeContent) {
            throw new Error("No response from judge");
          }

          let result: JudgeResult;
          try {
            const parsed = JSON.parse(judgeContent) as { pass: boolean; score: number; explanation: string };
            result = {
              pass: parsed.pass,
              score: parsed.score,
              explanation: parsed.explanation,
            };
          } catch {
            // If JSON parsing fails, try to extract values
            result = {
              pass: judgeContent.toLowerCase().includes("pass"),
              score: 0.5,
              explanation: judgeContent,
            };
          }

          // Report the judgment
          reporter.reportJudgment(result);

          return result;
        },
      };
    },
  };
}

/**
 * Check if OpenAI API key is available
 */
export function hasOpenAIKey(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

type DescribeFn = (name: string, fn: () => void) => void;
type DescribeWithSkip = DescribeFn & { skip: DescribeFn };

/**
 * A describe function that auto-skips if OPENAI_API_KEY is not set.
 * 
 * Works with both Vitest and Jest. Import and use directly as a replacement for `describe`.
 * 
 * @example
 * ```typescript
 * import { describeEval, setupMCPEval } from "@mcp-apps-kit/testing";
 * 
 * describeEval("MCP Eval Tests", () => {
 *   // Tests will be skipped if OPENAI_API_KEY is not set
 * });
 * ```
 */
export const describeEval: DescribeWithSkip = Object.assign(
  (name: string, fn: () => void) => {
    // Try to get describe from global (works in Vitest and Jest)
    const globalDescribe = (globalThis as Record<string, unknown>).describe as DescribeWithSkip | undefined;
    
    if (!globalDescribe) {
      console.warn("[describeEval] No test framework detected. Skipping:", name);
      return;
    }
    
    if (hasOpenAIKey()) {
      globalDescribe(name, fn);
    } else {
      globalDescribe.skip(name, fn);
    }
  },
  {
    skip: (name: string, fn: () => void) => {
      const globalDescribe = (globalThis as Record<string, unknown>).describe as DescribeWithSkip | undefined;
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
export async function setupMCPEval(
  app: App,
  config: MCPEvalSetupConfig = {}
): Promise<MCPEval> {
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
  
  // Create the evaluator
  const evaluator = createMCPEval(client, {
    model: config.model,
    apiKey: config.apiKey,
    maxTokens: config.maxTokens,
    systemPrompt: config.systemPrompt,
    verbose: config.verbose,
  });
  
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
