/**
 * Provider types for MCP evaluation
 *
 * Abstraction layer for different LLM providers (OpenAI, Anthropic, etc.)
 */

/**
 * Tool definition in provider-agnostic format
 */
export interface ProviderTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * A tool call made by the LLM
 */
export interface ProviderToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * A message in the conversation
 */
export interface ProviderMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ProviderToolCall[];
  toolCallId?: string;
}

/**
 * Response from a completion request
 */
export interface ProviderResponse {
  content: string;
  toolCalls: ProviderToolCall[];
  finishReason: "stop" | "tool_calls" | "length" | "error";
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Configuration for creating a provider
 */
export interface ProviderConfig {
  apiKey: string;
  model: string;
  maxTokens?: number;
}

/**
 * LLM Provider interface - abstracts OpenAI, Anthropic, etc.
 */
export interface LLMProvider {
  /** Provider name */
  readonly name: "openai" | "anthropic";

  /** Create a chat completion */
  createCompletion(messages: ProviderMessage[], tools?: ProviderTool[]): Promise<ProviderResponse>;

  /** Create a JSON completion (for judging) */
  createJSONCompletion(
    messages: ProviderMessage[]
  ): Promise<{ content: string; usage?: ProviderResponse["usage"] }>;
}

/**
 * Factory function type for creating providers
 */
export type ProviderFactory = (config: ProviderConfig) => Promise<LLMProvider>;
