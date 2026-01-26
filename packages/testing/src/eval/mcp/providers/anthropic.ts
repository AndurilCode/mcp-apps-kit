/**
 * Anthropic provider for MCP evaluation
 *
 * Requires @anthropic-ai/sdk >=0.30.0 for tool support.
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
 * Lazy loader for Anthropic module
 */
const getAnthropic = createLazyLoader(() => import("@anthropic-ai/sdk"), {
  packageName: "@anthropic-ai/sdk",
  installHint: "npm install -D @anthropic-ai/sdk",
});

/**
 * Create an Anthropic provider
 */
export async function createAnthropicProvider(config: ProviderConfig): Promise<LLMProvider> {
  const anthropicModule = await getAnthropic();
  const AnthropicClass = anthropicModule.default ?? anthropicModule.Anthropic ?? anthropicModule;

  // Use 'any' here because the Anthropic SDK types vary significantly between versions
  // The runtime behavior is consistent, but TypeScript can't verify it statically
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
  const anthropic = new (AnthropicClass as any)({
    apiKey: config.apiKey,
  });
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */

  const model = config.model;
  const maxTokens = config.maxTokens ?? 1024;

  llmLogger("Created Anthropic provider with model: %s", model);

  return {
    name: "anthropic",

    async createCompletion(
      messages: ProviderMessage[],
      tools?: ProviderTool[]
    ): Promise<ProviderResponse> {
      // Extract system message
      const systemMessage = messages.find((m) => m.role === "system");
      const conversationMessages = messages.filter((m) => m.role !== "system");

      // Build Anthropic messages format
      /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/restrict-plus-operands */
      const anthropicMessages: any[] = [];

      for (const msg of conversationMessages) {
        if (msg.role === "user") {
          anthropicMessages.push({
            role: "user",
            content: msg.content,
          });
        } else if (msg.role === "assistant") {
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            // Assistant message with tool calls

            const content: any[] = [];

            if (msg.content) {
              content.push({ type: "text", text: msg.content });
            }

            for (const tc of msg.toolCalls) {
              content.push({
                type: "tool_use",
                id: tc.id,
                name: tc.name,
                input: tc.arguments,
              });
            }

            anthropicMessages.push({
              role: "assistant",
              content,
            });
          } else {
            anthropicMessages.push({
              role: "assistant",
              content: msg.content,
            });
          }
        } else if (msg.role === "tool") {
          // Tool result - must be added to a user message
          const toolResult = {
            type: "tool_result",
            tool_use_id: msg.toolCallId,
            content: msg.content,
          };

          // Check if last message is a user message with tool results
          const lastMsg = anthropicMessages[anthropicMessages.length - 1];
          if (lastMsg?.role === "user" && Array.isArray(lastMsg.content)) {
            lastMsg.content.push(toolResult);
          } else {
            anthropicMessages.push({
              role: "user",
              content: [toolResult],
            });
          }
        }
      }

      // Convert tools to Anthropic format
      const anthropicTools = tools?.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
      }));

      const response: any = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemMessage?.content,
        messages: anthropicMessages,
        tools: anthropicTools && anthropicTools.length > 0 ? anthropicTools : undefined,
      });

      // Extract content and tool calls
      let content = "";
      const toolCalls: ProviderToolCall[] = [];

      for (const block of response.content) {
        if (block.type === "text") {
          content += block.text;
        } else if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: block.input as Record<string, unknown>,
          });
        }
      }

      // Determine finish reason
      let finishReason: ProviderResponse["finishReason"] = "stop";
      if (response.stop_reason === "tool_use") {
        finishReason = "tool_calls";
      } else if (response.stop_reason === "max_tokens") {
        finishReason = "length";
      }

      return {
        content,
        toolCalls,
        finishReason,
        usage: {
          promptTokens: response.usage?.input_tokens ?? 0,
          completionTokens: response.usage?.output_tokens ?? 0,
          totalTokens: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
        },
      };
      /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/restrict-plus-operands */
    },

    async createJSONCompletion(
      messages: ProviderMessage[]
    ): Promise<{ content: string; usage?: ProviderResponse["usage"] }> {
      // Extract system message and add JSON instruction
      const systemMessage = messages.find((m) => m.role === "system");
      const conversationMessages = messages.filter((m) => m.role !== "system");

      // Add JSON instruction to system prompt
      const jsonSystemPrompt = systemMessage
        ? `${systemMessage.content}\n\nIMPORTANT: Respond ONLY with valid JSON, no other text.`
        : "IMPORTANT: Respond ONLY with valid JSON, no other text.";

      // Filter to only include valid Anthropic roles (user/assistant), excluding tool roles
      const safeMessages = conversationMessages.filter(
        (m) => m.role === "user" || m.role === "assistant"
      );

      const anthropicMessages = safeMessages.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      }));

      /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/restrict-plus-operands */
      const response: any = await anthropic.messages.create({
        model,
        max_tokens: 512,
        system: jsonSystemPrompt,
        messages: anthropicMessages,
      });

      // Extract text content
      let content = "";
      for (const block of response.content) {
        if (block.type === "text") {
          content += block.text;
        }
      }

      return {
        content,
        usage: {
          promptTokens: response.usage?.input_tokens ?? 0,
          completionTokens: response.usage?.output_tokens ?? 0,
          totalTokens: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
        },
      };
      /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/restrict-plus-operands */
    },
  };
}
