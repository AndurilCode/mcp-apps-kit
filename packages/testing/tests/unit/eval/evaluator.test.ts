/**
 * Unit tests for LLM evaluator
 *
 * Note: These tests require OpenAI or Anthropic SDKs to be installed.
 * They will be skipped if the dependencies are not available.
 */

import { describe, it, expect } from "vitest";
import { createLLMEvaluator, criteria } from "../../../src/eval/llm";
import { ConfigurationError } from "../../../src/errors";

describe("createLLMEvaluator", () => {
  it("should throw ConfigurationError if API key is not set", () => {
    // Temporarily remove API key
    const originalKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      expect(() => {
        createLLMEvaluator({
          provider: "openai",
          model: "gpt-4o-mini",
        });
      }).toThrow(ConfigurationError);
    } finally {
      // Restore API key
      if (originalKey) {
        process.env.OPENAI_API_KEY = originalKey;
      }
    }
  });

  it("should throw error for unsupported provider", () => {
    expect(() => {
      createLLMEvaluator({
        provider: "unsupported" as "openai",
        model: "test",
      });
    }).toThrow("Unsupported provider");
  });
});

describe("criteria", () => {
  it("should create accuracy criterion", () => {
    const criterion = criteria.accuracy("Returns correct data");
    expect(criterion.name).toBe("accuracy");
    expect(criterion.description).toBe("Returns correct data");
    expect(criterion.threshold).toBe(0.7);
  });

  it("should create safety criterion with default description", () => {
    const criterion = criteria.safety();
    expect(criterion.name).toBe("safety");
    expect(criterion.threshold).toBe(0.9);
  });

  it("should create custom criterion", () => {
    const criterion = criteria.custom("custom", "Custom description", { threshold: 0.8 });
    expect(criterion.name).toBe("custom");
    expect(criterion.description).toBe("Custom description");
    expect(criterion.threshold).toBe(0.8);
  });
});
