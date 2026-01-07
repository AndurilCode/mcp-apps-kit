/**
 * OpenAI provider for MCP evaluation
 */

import { createLazyLoader } from "../../../utils/lazy-loader";
import { llmLogger } from "../../../debug";
import type {
  LLMProvider,
  ProviderConfig,
  ProviderMessage,
  ProviderTool,
  ProviderResponse,
  ProviderToolCall,
} from "./types";

/**
 * Lazy loader for OpenAI module
 */
const getOpenAI = createLazyLoader(() => import("openai"), {
  packageName: "openai",
  installHint: "npm install -D openai",
});

/**
 * Create an OpenAI provider
 */
export async function createOpenAIProvider(config: ProviderConfig): Promise<LLMProvider> {
  const openaiModule = await getOpenAI();
  const OpenAIClass = openaiModule.default ?? openaiModule.OpenAI ?? openaiModule;
  const openai = new (OpenAIClass as new (opts: { apiKey: string }) => import("openai").OpenAI)({
    apiKey: config.apiKey,
  });

  const model = config.model;
  const maxTokens = config.maxTokens ?? 1024;

  llmLogger("Created OpenAI provider with model: %s", model);

  return {
    name: "openai",

    async createCompletion(
      messages: ProviderMessage[],
      tools?: ProviderTool[]
    ): Promise<ProviderResponse> {
      // Convert to OpenAI format
      const openaiMessages = messages.map((msg) => {
        if (msg.role === "tool") {
          return {
            role: "tool" as const,
            content: msg.content,
            tool_call_id: msg.toolCallId!,
          };
        }
        if (msg.role === "assistant" && msg.toolCalls) {
          return {
            role: "assistant" as const,
            content: msg.content,
            tool_calls: msg.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.arguments),
              },
            })),
          };
        }
        return {
          role: msg.role as "system" | "user" | "assistant",
          content: msg.content,
        };
      });

      const openaiTools = tools?.map((tool) => ({
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));

      const completion = await openai.chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages: openaiMessages as Parameters<typeof openai.chat.completions.create>[0]["messages"],
        tools: openaiTools && openaiTools.length > 0 ? openaiTools : undefined,
      });

      const choice = completion.choices[0];
      if (!choice) {
        throw new Error("No response from OpenAI");
      }

      const assistantMessage = choice.message;

      // Convert tool calls to provider format
      const toolCalls: ProviderToolCall[] = (assistantMessage.tool_calls ?? []).map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: safeParseJSON(tc.function.arguments),
      }));

      // Determine finish reason
      let finishReason: ProviderResponse["finishReason"] = "stop";
      if (choice.finish_reason === "tool_calls") {
        finishReason = "tool_calls";
      } else if (choice.finish_reason === "length") {
        finishReason = "length";
      } else if (toolCalls.length > 0) {
        finishReason = "tool_calls";
      }

      return {
        content: assistantMessage.content ?? "",
        toolCalls,
        finishReason,
        usage: completion.usage
          ? {
              promptTokens: completion.usage.prompt_tokens,
              completionTokens: completion.usage.completion_tokens,
              totalTokens: completion.usage.total_tokens,
            }
          : undefined,
      };
    },

    async createJSONCompletion(
      messages: ProviderMessage[]
    ): Promise<{ content: string; usage?: ProviderResponse["usage"] }> {
      const openaiMessages = messages.map((msg) => ({
        role: msg.role as "system" | "user" | "assistant",
        content: msg.content,
      }));

      const completion = await openai.chat.completions.create({
        model,
        max_tokens: 512,
        messages: openaiMessages,
        response_format: { type: "json_object" },
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from OpenAI");
      }

      return {
        content,
        usage: completion.usage
          ? {
              promptTokens: completion.usage.prompt_tokens,
              completionTokens: completion.usage.completion_tokens,
              totalTokens: completion.usage.total_tokens,
            }
          : undefined,
      };
    },
  };
}

function safeParseJSON(str: string): Record<string, unknown> {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}
