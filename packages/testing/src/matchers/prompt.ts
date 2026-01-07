/**
 * Prompt matchers for MCP prompt testing
 *
 * Provides standalone assertion functions for validating prompt outputs.
 */

import type { PromptResult, PromptResultAssertion } from "../types";
import { AssertionError } from "../errors";
import { matcherLogger } from "../debug";

/**
 * Create an assertion interface for a prompt result
 *
 * @param result - Prompt result to assert against
 * @returns Assertion interface with various matcher methods
 *
 * @example
 * ```typescript
 * const result = await client.getPrompt('code-review', { language: 'typescript' });
 * expectPrompt(result).toHaveMessages();
 * expectPrompt(result).toContainUserMessage('Review this code');
 * ```
 */
export function expectPrompt(result: PromptResult): PromptResultAssertion {
  matcherLogger("Creating assertion for prompt result: %o", result);

  return {
    /**
     * Assert prompt has messages
     */
    toHaveMessages(): void {
      matcherLogger("Asserting prompt has messages");
      if (!result.messages || result.messages.length === 0) {
        throw new AssertionError(
          result.messages,
          "non-empty messages",
          "Expected prompt to have messages, but it was empty"
        );
      }
    },

    /**
     * Assert prompt has specific number of messages
     */
    toHaveMessageCount(count: number): void {
      matcherLogger("Asserting prompt has %d messages", count);
      const actualCount = result.messages?.length ?? 0;
      if (actualCount !== count) {
        throw new AssertionError(
          actualCount,
          count,
          `Expected prompt to have ${count} messages, but got ${actualCount}`
        );
      }
    },

    /**
     * Assert prompt contains user message with text
     */
    toContainUserMessage(text: string): void {
      matcherLogger("Asserting prompt contains user message: %s", text);
      const userMessages = result.messages?.filter((m) => m.role === "user") ?? [];
      const hasMessage = userMessages.some((m) => {
        if (m.content.type === "text" && m.content.text) {
          return m.content.text.includes(text);
        }
        return false;
      });

      if (!hasMessage) {
        const actualUserMessages = userMessages
          .map((m) => m.content.text ?? "[non-text content]")
          .join("\n---\n");
        throw new AssertionError(
          actualUserMessages,
          text,
          `Expected prompt to contain user message with "${text}", but it didn't. User messages: ${actualUserMessages}`
        );
      }
    },

    /**
     * Assert prompt contains assistant message with text
     */
    toContainAssistantMessage(text: string): void {
      matcherLogger("Asserting prompt contains assistant message: %s", text);
      const assistantMessages = result.messages?.filter((m) => m.role === "assistant") ?? [];
      const hasMessage = assistantMessages.some((m) => {
        if (m.content.type === "text" && m.content.text) {
          return m.content.text.includes(text);
        }
        return false;
      });

      if (!hasMessage) {
        const actualAssistantMessages = assistantMessages
          .map((m) => m.content.text ?? "[non-text content]")
          .join("\n---\n");
        throw new AssertionError(
          actualAssistantMessages,
          text,
          `Expected prompt to contain assistant message with "${text}", but it didn't. Assistant messages: ${actualAssistantMessages}`
        );
      }
    },

    /**
     * Assert prompt has description
     */
    toHaveDescription(description?: string): void {
      matcherLogger("Asserting prompt has description%s", description ? `: ${description}` : "");

      if (!result.description) {
        throw new AssertionError(
          result.description,
          description ?? "any description",
          "Expected prompt to have a description, but it doesn't"
        );
      }

      if (description && result.description !== description) {
        throw new AssertionError(
          result.description,
          description,
          `Expected prompt description to be "${description}", but got "${result.description}"`
        );
      }
    },
  };
}
