# @mcp-apps-kit/testing

[![npm](https://img.shields.io/npm/v/%40mcp-apps-kit%2Ftesting)](https://www.npmjs.com/package/@mcp-apps-kit/testing) [![node](https://img.shields.io/node/v/%40mcp-apps-kit%2Ftesting)](https://www.npmjs.com/package/@mcp-apps-kit/testing) [![license](https://img.shields.io/npm/l/%40mcp-apps-kit%2Ftesting)](https://www.npmjs.com/package/@mcp-apps-kit/testing)

Comprehensive testing library for MCP applications.

## Features

- **Test Server Management**: Start and stop MCP servers programmatically
- **Behavior Testing**: Assert tool outputs with custom matchers
- **Property-Based Testing**: Discover edge cases with generated inputs
- **LLM-Based Evaluation**: AI-powered quality assessment
- **Mock Host Environment**: Test UI widgets without a browser
- **Framework Integration**: Native Vitest and Jest matchers

## Install

```bash
npm install @mcp-apps-kit/testing zod
```

For optional features:

```bash
# Property-based testing
npm install -D fast-check zod-fast-check

# LLM evaluation
npm install -D openai @anthropic-ai/sdk

# Framework matchers
npm install -D vitest  # or jest
```

## Quick Start

### Basic Testing

```ts
import { createTestEnvironment, expectToolResult } from "@mcp-apps-kit/testing";
import { createApp, defineTool } from "@mcp-apps-kit/core";
import { z } from "zod";

const app = createApp({
  name: "test-app",
  version: "1.0.0",
  tools: {
    greet: defineTool({
      description: "Greet a user",
      input: z.object({ name: z.string() }),
      output: z.object({ message: z.string() }),
      handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
    }),
  },
});

const env = await createTestEnvironment({ app });
const result = await env.client.callTool("greet", { name: "Alice" });

expectToolResult(result).toMatchObject({ message: "Hello, Alice!" });
await env.cleanup();
```

### Test Suites

```ts
import { defineTestSuite, runTestSuite } from "@mcp-apps-kit/testing";

const suite = defineTestSuite({
  name: "greet tool",
  tool: "greet",
  cases: [
    { name: "greets by name", input: { name: "Alice" }, expected: { message: "Hello, Alice!" } },
    { name: "handles empty", input: { name: "" }, expectError: { code: "VALIDATION_ERROR" } },
  ],
});

const results = await runTestSuite(client, suite);
console.log(`${results.passed}/${results.total} passed`);
```

### Framework Matchers (Vitest)

```ts
// vitest.setup.ts
import { setupVitestMatchers } from "@mcp-apps-kit/testing/vitest";
setupVitestMatchers();

// In your tests
import { expect } from "vitest";

const result = await client.callTool("greet", { name: "Alice" });
expect(result).toBeSuccessfulToolResult();
expect(result).toMatchToolSchema(outputSchema);
```

### Property-Based Testing

```ts
import { generators, forAllInputs } from "@mcp-apps-kit/testing";
import { z } from "zod";

const inputSchema = z.object({
  name: z.string().min(1).max(100),
});

await forAllInputs(
  generators.fromSchema(inputSchema),
  async (input) => {
    const result = await client.callTool("greet", input);
    return result.content[0].text.includes(input.name);
  },
  { numRuns: 100 }
);
```

### LLM Evaluation

```ts
import { createLLMEvaluator, criteria } from "@mcp-apps-kit/testing";

const evaluator = createLLMEvaluator({
  provider: "openai",
  model: "gpt-4o-mini",
});

const evaluation = await evaluator.evaluate(result, {
  criteria: [
    criteria.accuracy("Returns correct restaurant data"),
    criteria.relevance("Results match search location"),
    criteria.safety(),
  ],
});

console.log(`Overall score: ${evaluation.overall.score}`);
```

### Mock Host for UI Testing

```ts
import { createMockHost } from "@mcp-apps-kit/testing";

const host = createMockHost({
  protocol: "mcp",
  initialContext: { theme: "dark" },
});

host.emitToolResult({ restaurants: [...] });
expect(host.getToolCallHistory()).toHaveLength(1);
```

## API Reference

### Server Utilities

- `createTestClient(url, options?)` - Create a test client
- `startTestServer(app, options?)` - Start server from App instance
- `startTestServer(options)` - Start external server process
- `createTestEnvironment(options)` - Create complete test environment
- `TestEnvironmentBuilder` - Fluent builder for test environments

### Behavior Testing

- `expectToolResult(result)` - Standalone matcher
- `defineTestSuite(config)` - Define test suite
- `runTestSuite(client, suite)` - Run test suite

### Property Testing

- `generators` - Value generators (string, integer, fromSchema, etc.)
- `forAllInputs(generator, predicate, options?)` - Run property tests

### LLM Evaluation

- `createLLMEvaluator(config)` - Create LLM evaluator
- `criteria` - Built-in criteria (accuracy, relevance, safety, completeness)

### UI Testing

- `createMockHost(options?)` - Create mock host environment

### Framework Adapters

- `setupVitestMatchers()` - Setup Vitest matchers (from `@mcp-apps-kit/testing/vitest`)
- `setupJestMatchers()` - Setup Jest matchers (from `@mcp-apps-kit/testing/jest`)

## Documentation

See the [quickstart guide](../../specs/001-testing-library/quickstart.md) for detailed examples and API documentation.

## License

MIT
