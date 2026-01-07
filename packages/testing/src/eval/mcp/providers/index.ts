/**
 * LLM Provider factory
 * 
 * Creates provider instances based on configuration.
 */

import { ConfigurationError } from "../../../errors";
import { createOpenAIProvider } from "./openai";
import { createAnthropicProvider } from "./anthropic";
import type { LLMProvider, ProviderConfig } from "./types";

export type { 
  LLMProvider, 
  ProviderConfig, 
  ProviderMessage, 
  ProviderTool, 
  ProviderResponse,
  ProviderToolCall,
} from "./types";

export { createOpenAIProvider } from "./openai";
export { createAnthropicProvider } from "./anthropic";

/**
 * Supported provider types
 */
export type ProviderType = "openai" | "anthropic";

/**
 * Get the API key for a provider from environment
 */
export function getProviderApiKey(provider: ProviderType): string | undefined {
  switch (provider) {
    case "openai":
      return process.env.OPENAI_API_KEY;
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY;
    default:
      return undefined;
  }
}

/**
 * Check if a provider API key is available
 */
export function hasProviderKey(provider: ProviderType): boolean {
  return !!getProviderApiKey(provider);
}

/**
 * Get default model for a provider
 */
export function getDefaultModel(provider: ProviderType): string {
  switch (provider) {
    case "openai":
      return "gpt-4o-mini";
    case "anthropic":
      return "claude-3-haiku-20240307";
    default:
      return "gpt-4o-mini";
  }
}

/**
 * Create an LLM provider instance
 * 
 * @param provider - Provider type ("openai" or "anthropic")
 * @param config - Provider configuration
 * @returns Configured LLM provider
 * 
 * @example
 * ```typescript
 * const provider = await createProvider("openai", {
 *   apiKey: process.env.OPENAI_API_KEY!,
 *   model: "gpt-4o-mini",
 * });
 * ```
 */
export async function createProvider(
  provider: ProviderType,
  config: ProviderConfig
): Promise<LLMProvider> {
  switch (provider) {
    case "openai":
      return createOpenAIProvider(config);
    case "anthropic":
      return createAnthropicProvider(config);
    default:
      throw new ConfigurationError(
        "provider",
        `Unknown provider: ${provider}. Supported providers: openai, anthropic`
      );
  }
}

/**
 * Detect provider from available API keys
 * 
 * Returns the first available provider based on environment variables.
 */
export function detectProvider(): ProviderType | undefined {
  if (process.env.OPENAI_API_KEY) {
    return "openai";
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return "anthropic";
  }
  return undefined;
}
