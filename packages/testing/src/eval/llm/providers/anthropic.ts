/**
 * Anthropic provider for LLM evaluation
 *
 * Requires @anthropic-ai/sdk package as peer dependency.
 */

import { ConfigurationError } from "../../../errors";
import { llmLogger } from "../../../debug";
import type { LLMProvider } from "./index";
import type {
  EvaluationResult,
  EvalOptions,
  CustomEvalOptions,
  CriterionResult,
} from "../../../types";

// Lazy-loaded Anthropic module
let anthropicModule: typeof import("@anthropic-ai/sdk") | null = null;

/**
 * Load Anthropic module (lazy, throws if not available)
 */
function getAnthropic(): typeof import("@anthropic-ai/sdk") {
  if (!anthropicModule) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      anthropicModule = require("@anthropic-ai/sdk");
    } catch {
      throw new ConfigurationError(
        "@anthropic-ai/sdk",
        "@anthropic-ai/sdk package is required for Anthropic evaluation. Install it with: npm install -D @anthropic-ai/sdk"
      );
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return anthropicModule!;
}

/**
 * Create Anthropic provider
 */
export function createAnthropicProvider(
  model: string,
  apiKey?: string
): LLMProvider {
  llmLogger("Creating Anthropic provider with model: %s", model);

  const apiKeyValue = apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKeyValue) {
    throw new ConfigurationError(
      "ANTHROPIC_API_KEY",
      "ANTHROPIC_API_KEY environment variable is required for Anthropic evaluation"
    );
  }

  const Anthropic = getAnthropic();
  const client = new Anthropic.Anthropic({ apiKey: apiKeyValue });

  return {
    async evaluate(result: unknown, options: EvalOptions): Promise<EvaluationResult> {
      llmLogger("Evaluating result with Anthropic against %d criteria", options.criteria.length);

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

      if (!response.content || response.content.length === 0) {
        throw new Error("Empty content in Anthropic response");
      }

      const content = response.content[0]!;
      if (content.type !== "text") {
        throw new Error("Unexpected response type from Anthropic");
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

        parsed = JSON.parse(cleanText) as {
          criteria: Array<{ name: string; score: number; explanation: string }>;
          overall: { score: number };
        };
      } catch (parseError) {
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

    async evaluateWithPrompt(
      result: unknown,
      options: CustomEvalOptions
    ): Promise<unknown> {
      llmLogger("Evaluating result with custom prompt");

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

      if (!response.content || response.content.length === 0) {
        throw new Error("Empty content in Anthropic response");
      }

      const content = response.content[0]!;
      if (content.type !== "text") {
        throw new Error("Unexpected response type from Anthropic");
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
    '{\n' +
    '  "criteria": [\n' +
    '    { "name": "criterion_name", "score": 0.0-1.0, "explanation": "..." },\n' +
    '    ...\n' +
    '  ],\n' +
    '  "overall": { "score": 0.0-1.0 }\n' +
    "}\n";

  return prompt;
}
