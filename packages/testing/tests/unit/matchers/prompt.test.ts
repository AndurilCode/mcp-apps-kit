/**
 * Unit tests for prompt matchers
 */

import { describe, it, expect } from "vitest";
import { expectPrompt } from "../../../src/matchers/prompt";
import { AssertionError } from "../../../src/errors";
import type { PromptResult } from "../../../src/types";

describe("expectPrompt", () => {
  describe("toHaveMessages", () => {
    it("should pass when prompt has messages", () => {
      const result: PromptResult = {
        messages: [{ role: "user", content: { type: "text", text: "Hello" } }],
      };

      expect(() => expectPrompt(result).toHaveMessages()).not.toThrow();
    });

    it("should fail when prompt has no messages", () => {
      const result: PromptResult = {
        messages: [],
      };

      expect(() => expectPrompt(result).toHaveMessages()).toThrow(AssertionError);
    });
  });

  describe("toHaveMessageCount", () => {
    it("should pass when message count matches", () => {
      const result: PromptResult = {
        messages: [
          { role: "user", content: { type: "text", text: "Hello" } },
          { role: "assistant", content: { type: "text", text: "Hi" } },
        ],
      };

      expect(() => expectPrompt(result).toHaveMessageCount(2)).not.toThrow();
    });

    it("should fail when message count does not match", () => {
      const result: PromptResult = {
        messages: [{ role: "user", content: { type: "text", text: "Hello" } }],
      };

      expect(() => expectPrompt(result).toHaveMessageCount(2)).toThrow(AssertionError);
    });
  });

  describe("toContainUserMessage", () => {
    it("should pass when user message contains text", () => {
      const result: PromptResult = {
        messages: [
          { role: "user", content: { type: "text", text: "Please review this code" } },
          { role: "assistant", content: { type: "text", text: "I'll review it" } },
        ],
      };

      expect(() => expectPrompt(result).toContainUserMessage("review")).not.toThrow();
    });

    it("should fail when user message does not contain text", () => {
      const result: PromptResult = {
        messages: [{ role: "user", content: { type: "text", text: "Hello" } }],
      };

      expect(() => expectPrompt(result).toContainUserMessage("goodbye")).toThrow(AssertionError);
    });

    it("should fail when only assistant messages match", () => {
      const result: PromptResult = {
        messages: [{ role: "assistant", content: { type: "text", text: "I'll help you review" } }],
      };

      expect(() => expectPrompt(result).toContainUserMessage("review")).toThrow(AssertionError);
    });
  });

  describe("toContainAssistantMessage", () => {
    it("should pass when assistant message contains text", () => {
      const result: PromptResult = {
        messages: [
          { role: "user", content: { type: "text", text: "Help me" } },
          { role: "assistant", content: { type: "text", text: "I can help with that" } },
        ],
      };

      expect(() => expectPrompt(result).toContainAssistantMessage("help")).not.toThrow();
    });

    it("should fail when assistant message does not contain text", () => {
      const result: PromptResult = {
        messages: [{ role: "assistant", content: { type: "text", text: "Hello" } }],
      };

      expect(() => expectPrompt(result).toContainAssistantMessage("goodbye")).toThrow(
        AssertionError
      );
    });

    it("should fail when only user messages match", () => {
      const result: PromptResult = {
        messages: [{ role: "user", content: { type: "text", text: "Please help" } }],
      };

      expect(() => expectPrompt(result).toContainAssistantMessage("help")).toThrow(AssertionError);
    });
  });

  describe("toHaveDescription", () => {
    it("should pass when prompt has any description", () => {
      const result: PromptResult = {
        description: "A helpful prompt",
        messages: [],
      };

      expect(() => expectPrompt(result).toHaveDescription()).not.toThrow();
    });

    it("should pass when description matches exactly", () => {
      const result: PromptResult = {
        description: "A helpful prompt",
        messages: [],
      };

      expect(() => expectPrompt(result).toHaveDescription("A helpful prompt")).not.toThrow();
    });

    it("should fail when prompt has no description", () => {
      const result: PromptResult = {
        messages: [],
      };

      expect(() => expectPrompt(result).toHaveDescription()).toThrow(AssertionError);
    });

    it("should fail when description does not match", () => {
      const result: PromptResult = {
        description: "A helpful prompt",
        messages: [],
      };

      expect(() => expectPrompt(result).toHaveDescription("Different description")).toThrow(
        AssertionError
      );
    });
  });

  describe("combined assertions", () => {
    it("should support chaining multiple assertions", () => {
      const result: PromptResult = {
        description: "Code review prompt",
        messages: [
          { role: "user", content: { type: "text", text: "Review this TypeScript code" } },
          { role: "assistant", content: { type: "text", text: "I'll analyze the code" } },
        ],
      };

      expect(() => {
        expectPrompt(result).toHaveMessages();
        expectPrompt(result).toHaveMessageCount(2);
        expectPrompt(result).toContainUserMessage("TypeScript");
        expectPrompt(result).toContainAssistantMessage("analyze");
        expectPrompt(result).toHaveDescription("Code review prompt");
      }).not.toThrow();
    });
  });
});
