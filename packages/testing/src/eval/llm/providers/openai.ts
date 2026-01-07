/**
 * OpenAI provider for LLM evaluation
 *
 * Requires openai package as an optional peer dependency.
 */

import { ConfigurationError } from "../../../errors";
import { llmLogger } from "../../../debug";
import { createLazyLoader, createCachedClientFactory } from "../../../utils/lazy-loader";
import type { LLMProvider } from "./index";
import type {
  EvaluationResult,
  EvalOptions,
  CustomEvalOptions,
  CriteriaResults,
} from "../../../types";

/**
 * Lazy loader for OpenAI module
 */
const getOpenAI = createLazyLoader(() => import("openai"), {
  packageName: "openai",
  installHint: "npm install -D openai",
});

/**
 * Cached client factory for OpenAI
 */
const openaiClientFactory = createCachedClientFactory(async (apiKey: string) => {
  const openai = await getOpenAI();
  // The OpenAI SDK exports the class as default export
  const OpenAIClass = openai.default ?? openai.OpenAI ?? openai;
  return new (OpenAIClass as new (opts: { apiKey: string }) => import("openai").OpenAI)({
    apiKey,
  });
});

/**
 * Create OpenAI provider
 */
export function createOpenAIProvider(model: string, apiKey?: string): LLMProvider {
  llmLogger("Creating OpenAI provider with model: %s", model);

  const apiKeyValue = apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKeyValue) {
    throw new ConfigurationError(
      "OPENAI_API_KEY",
      "OPENAI_API_KEY environment variable is required for OpenAI evaluation"
    );
  }

  return {
    async evaluate(result: unknown, options: EvalOptions): Promise<EvaluationResult> {
      llmLogger("Evaluating result with OpenAI against %d criteria", options.criteria.length);

      // Get or create client (async for ESM compatibility)
      const client = await openaiClientFactory.get(apiKeyValue);

      // Build evaluation prompt
      const prompt = buildEvaluationPrompt(result, options);

      // Call OpenAI API
      const response = await client.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are an evaluation assistant. Evaluate the given result against the criteria and return a JSON object with scores (0-1) and explanations for each criterion.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response content from OpenAI");
      }

      // Parse response
      const parsed = JSON.parse(content) as {
        criteria: Array<{ name: string; score: number; explanation: string }>;
        overall: { score: number };
      };

      // Build evaluation result as a record keyed by criterion name
      const criteriaResults: CriteriaResults = {};
      for (const criterion of options.criteria) {
        const result = parsed.criteria.find((c) => c.name === criterion.name);
        if (!result) {
          throw new Error(`Missing evaluation result for criterion: ${criterion.name}`);
        }

        const threshold = criterion.threshold ?? 0.7;
        criteriaResults[criterion.name] = {
          name: criterion.name,
          score: result.score,
          pass: result.score >= threshold,
          explanation: result.explanation,
        };
      }

      const overallScore = parsed.overall.score;
      const passThreshold = 0.7; // Default overall threshold
      const overallPass = overallScore >= passThreshold;

      return {
        overall: {
          score: overallScore,
          pass: overallPass,
        },
        criteria: criteriaResults,
        rawResponse: content,
      };
    },

    async evaluateWithPrompt(result: unknown, options: CustomEvalOptions): Promise<unknown> {
      llmLogger("Evaluating result with custom prompt");

      // Get or create client (async for ESM compatibility)
      const client = await openaiClientFactory.get(apiKeyValue);

      const response = await client.chat.completions.create({
        model,
        messages: [
          {
            role: "user",
            content: options.prompt.replace("{{result}}", JSON.stringify(result, null, 2)),
          },
        ],
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response content from OpenAI");
      }

      if (options.parseResponse) {
        return options.parseResponse(content);
      }

      return content;
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
