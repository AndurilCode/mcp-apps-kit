/**
 * Anthropic provider for LLM evaluation
 *
 * Requires @anthropic-ai/sdk package as an optional peer dependency.
 */

import { ConfigurationError } from "../../../errors";
import { llmLogger } from "../../../debug";
import { createLazyLoader, createCachedClientFactory } from "../../../utils/lazy-loader";
import type { LLMProvider } from "./index";
import type {
  EvaluationResult,
  EvalOptions,
  CustomEvalOptions,
  CriterionResult,
} from "../../../types";

/**
 * Lazy loader for Anthropic module
 */
const getAnthropic = createLazyLoader(() => import("@anthropic-ai/sdk"), {
  packageName: "@anthropic-ai/sdk",
  installHint: "npm install -D @anthropic-ai/sdk",
});

/**
 * Cached client factory for Anthropic
 */
const anthropicClientFactory = createCachedClientFactory(async (apiKey: string) => {
  const anthropicMod = await getAnthropic();
  // The Anthropic SDK exports the class as default export or as Anthropic
  const AnthropicClass = anthropicMod.default ?? anthropicMod.Anthropic ?? anthropicMod;
  return new (AnthropicClass as new (opts: {
    apiKey: string;
  }) => import("@anthropic-ai/sdk").Anthropic)({
    apiKey,
  });
});

/**
 * Create Anthropic provider
 */
export function createAnthropicProvider(model: string, apiKey?: string): LLMProvider {
  llmLogger("Creating Anthropic provider with model: %s", model);

  const apiKeyValue = apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKeyValue) {
    throw new ConfigurationError(
      "ANTHROPIC_API_KEY",
      "ANTHROPIC_API_KEY environment variable is required for Anthropic evaluation"
    );
  }

  return {
    async evaluate(result: unknown, options: EvalOptions): Promise<EvaluationResult> {
      llmLogger("Evaluating result with Anthropic against %d criteria", options.criteria.length);

      // Get or create client (async for ESM compatibility)
      const client = await anthropicClientFactory.get(apiKeyValue);

      // Build evaluation prompt
      const prompt = buildEvaluationPrompt(result, options);

      // Call Anthropic API
      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const content = response.content[0];
      if (content?.type !== "text") {
        throw new Error("Empty or unexpected response type from Anthropic");
      }

      const text = content.text;

      // Parse response - strip markdown code fences and parse JSON
      let parsed: {
        criteria: Array<{ name: string; score: number; explanation: string }>;
        overall: { score: number };
      };

      try {
        // Strip common markdown code fences (```json ... ``` or ``` ... ```)
        let cleanText = text.trim();
        if (cleanText.startsWith("```")) {
          // Remove opening fence (with optional language tag)
          cleanText = cleanText.replace(/^```[a-z]*\n?/i, "");
          // Remove closing fence
          cleanText = cleanText.replace(/\n?```$/i, "");
        }
        cleanText = cleanText.trim();

        const rawParsed: unknown = JSON.parse(cleanText);

        // Runtime validation of parsed structure
        const preview = text.length > 200 ? text.substring(0, 200) + "..." : text;

        if (typeof rawParsed !== "object" || rawParsed === null) {
          throw new Error(
            `Expected parsed response to be an object, got ${typeof rawParsed}. Response preview: ${preview}`
          );
        }

        const parsedObj = rawParsed as Record<string, unknown>;

        if (!Array.isArray(parsedObj.criteria)) {
          throw new Error(
            `Expected parsed.criteria to be an array, got ${typeof parsedObj.criteria}. Response preview: ${preview}`
          );
        }

        // Validate each criterion in the array
        for (let i = 0; i < parsedObj.criteria.length; i++) {
          const item = parsedObj.criteria[i] as Record<string, unknown>;
          if (typeof item !== "object" || item === null) {
            throw new Error(
              `Expected parsed.criteria[${i}] to be an object, got ${typeof item}. Response preview: ${preview}`
            );
          }
          if (typeof item.name !== "string") {
            throw new Error(
              `Expected parsed.criteria[${i}].name to be a string, got ${typeof item.name}. Response preview: ${preview}`
            );
          }
          if (typeof item.score !== "number") {
            throw new Error(
              `Expected parsed.criteria[${i}].score to be a number, got ${typeof item.score}. Response preview: ${preview}`
            );
          }
          if (typeof item.explanation !== "string") {
            throw new Error(
              `Expected parsed.criteria[${i}].explanation to be a string, got ${typeof item.explanation}. Response preview: ${preview}`
            );
          }
        }

        if (typeof parsedObj.overall !== "object" || parsedObj.overall === null) {
          throw new Error(
            `Expected parsed.overall to be an object, got ${typeof parsedObj.overall}. Response preview: ${preview}`
          );
        }

        const overallObj = parsedObj.overall as Record<string, unknown>;
        if (typeof overallObj.score !== "number") {
          throw new Error(
            `Expected parsed.overall.score to be a number, got ${typeof overallObj.score}. Response preview: ${preview}`
          );
        }

        parsed = rawParsed as {
          criteria: Array<{ name: string; score: number; explanation: string }>;
          overall: { score: number };
        };
      } catch (parseError) {
        // Re-throw validation errors as-is
        if (parseError instanceof Error && parseError.message.includes("Expected parsed")) {
          throw parseError;
        }
        // Wrap JSON parse errors with context
        const preview = text.length > 200 ? text.substring(0, 200) + "..." : text;
        const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
        throw new Error(
          `Failed to parse Anthropic response as JSON (expected { criteria: [...], overall: { score } }). ` +
            `Parse error: ${errorMsg}. Response preview: ${preview}`
        );
      }

      // Build evaluation result
      const criteriaResults: CriterionResult[] = options.criteria.map((criterion) => {
        const result = parsed.criteria.find((c) => c.name === criterion.name);
        if (!result) {
          throw new Error(`Missing evaluation result for criterion: ${criterion.name}`);
        }

        const threshold = criterion.threshold ?? 0.7;
        return {
          name: criterion.name,
          score: result.score,
          pass: result.score >= threshold,
          explanation: result.explanation,
        };
      });

      const overallScore = parsed.overall.score;
      const passThreshold = 0.7; // Default overall threshold
      const overallPass = overallScore >= passThreshold;

      return {
        overall: {
          score: overallScore,
          pass: overallPass,
        },
        criteria: criteriaResults,
        rawResponse: text,
      };
    },

    async evaluateWithPrompt(result: unknown, options: CustomEvalOptions): Promise<unknown> {
      llmLogger("Evaluating result with custom prompt");

      // Get or create client (async for ESM compatibility)
      const client = await anthropicClientFactory.get(apiKeyValue);

      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: options.prompt.replace("{{result}}", JSON.stringify(result, null, 2)),
          },
        ],
      });

      const content = response.content[0];
      if (content?.type !== "text") {
        throw new Error("Empty or unexpected response type from Anthropic");
      }

      const text = content.text;

      if (options.parseResponse) {
        return options.parseResponse(text);
      }

      return text;
    },
  };
}

/**
 * Build evaluation prompt from options
 */
function buildEvaluationPrompt(result: unknown, options: EvalOptions): string {
  const context = options.context;
  let prompt = "Evaluate the following result:\n\n";
  prompt += `Result: ${JSON.stringify(result, null, 2)}\n\n`;

  if (context) {
    if (context.toolName) {
      prompt += `Tool: ${context.toolName}\n`;
    }
    if (context.input) {
      prompt += `Input: ${JSON.stringify(context.input, null, 2)}\n`;
    }
    if (context.description) {
      prompt += `Description: ${context.description}\n`;
    }
    prompt += "\n";
  }

  prompt += "Criteria:\n";
  for (const criterion of options.criteria) {
    prompt += `- ${criterion.name}: ${criterion.description}\n`;
  }

  prompt +=
    "\nReturn a JSON object with this structure:\n" +
    "{\n" +
    '  "criteria": [\n' +
    '    { "name": "criterion_name", "score": 0.0-1.0, "explanation": "..." },\n' +
    "    ...\n" +
    "  ],\n" +
    '  "overall": { "score": 0.0-1.0 }\n' +
    "}\n";

  return prompt;
}
