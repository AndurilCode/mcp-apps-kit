# @mcp-apps-kit/testing

[![npm](https://img.shields.io/npm/v/%40mcp-apps-kit%2Ftesting)](https://www.npmjs.com/package/@mcp-apps-kit/testing) [![node](https://img.shields.io/node/v/%40mcp-apps-kit%2Ftesting)](https://www.npmjs.com/package/@mcp-apps-kit/testing) [![license](https://img.shields.io/npm/l/%40mcp-apps-kit%2Ftesting)](https://www.npmjs.com/package/@mcp-apps-kit/testing)

Comprehensive testing library for MCP applications.

MCP AppsKit Testing provides utilities for testing MCP tools, UI widgets, and full application flows. It supports behavior testing with custom matchers, property-based testing for edge case discovery, LLM-powered evaluation, and mock host environments for UI testing.

## Table of Contents

- [Background](#background)
- [Features](#features)
- [Compatibility](#compatibility)
- [Install](#install)
- [Quick Start](#quick-start)
- [Test Environment](#test-environment)
- [Assertions & Matchers](#assertions--matchers)
- [Test Suites](#test-suites)
- [Property-Based Testing](#property-based-testing)
- [UI Widget Testing](#ui-widget-testing)
- [Mock Host Environment](#mock-host-environment)
- [LLM Evaluation](#llm-evaluation)
  - [MCP Eval (Recommended)](#mcp-eval-recommended)
  - [Output Quality Evaluation](#output-quality-evaluation)
- [Framework Integration](#framework-integration)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Contributing](#contributing)
- [License](#license)

## Background

Testing MCP applications involves multiple layers: validating tool behavior, testing UI components that display tool results, and evaluating output quality. This library provides a unified testing API that works with any MCP-compliant server and integrates with popular test frameworks like Vitest and Jest.

## Features

- **Test Server Management**: Start MCP servers from App instances or external commands
- **Test Client**: Programmatic client with call history tracking and timeout support
- **Behavior Testing**: Custom matchers for asserting tool outputs
- **Test Suites**: Declarative test definitions with hooks and skip flags
- **Property-Based Testing**: Generate random inputs using fast-check
- **Mock Host Environment**: Test UI widgets without a browser
- **LLM Evaluation**: AI-powered quality assessment with OpenAI/Anthropic
- **Framework Integration**: Native Vitest and Jest matchers

## Compatibility

- Node.js: `>= 20`
- Zod: `^4.0.0` (bundled dependency)
- Test Frameworks: Vitest `^3.0.0 || ^4.0.0` or Jest `^29.0.0` (optional peer dependencies)

## Install

```bash
npm install @mcp-apps-kit/testing
```

This package includes core dependencies for:

- **Core testing**: Server management, test client, assertions
- **MCP Protocol**: `@modelcontextprotocol/sdk` for MCP communication
- **Schema validation**: `zod` for runtime type checking

### Optional Dependencies

Install optional dependencies only for the features you need:

```bash
# For property-based testing
npm install -D fast-check

# For LLM evaluation with OpenAI
npm install -D openai

# For LLM evaluation with Anthropic
npm install -D @anthropic-ai/sdk

# For Vitest framework matchers
npm install -D vitest

# For Jest framework matchers
npm install -D jest
```

These are optional peer dependencies—the library will throw helpful error messages if you try to use a feature without its required dependency.

## Quick Start

### Basic Tool Testing

```ts
import { createTestEnvironment, expectToolResult } from "@mcp-apps-kit/testing";
import { app } from "./app";

// Create test environment with your app
const env = await createTestEnvironment({
  app,
  port: 3001,
  version: "v1", // For versioned apps
});

// Call a tool
const result = await env.client.callTool("greet", { name: "Alice" });

// Assert the result
expectToolResult(result).toHaveNoError();
expectToolResult(result).toContainText("Alice");

// Cleanup
await env.cleanup();
```

### Using with Vitest

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestEnvironment, expectToolResult } from "@mcp-apps-kit/testing";
import type { TestEnvironment } from "@mcp-apps-kit/testing";
import { app } from "../src/index";

describe("Greet Tool", () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await createTestEnvironment({
      app,
      port: 3001,
      version: "v1",
    });
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it("should greet by name", async () => {
    const result = await env.client.callTool("greet", { name: "Alice" });

    expectToolResult(result).toHaveNoError();
    expectToolResult(result).toContainText("Alice");
  });
});
```

## Test Environment

### createTestEnvironment

The simplest way to set up a test environment:

```ts
import { createTestEnvironment } from "@mcp-apps-kit/testing";

const env = await createTestEnvironment({
  app, // Your MCP app instance
  port: 3001, // Server port (default: 3000)
  version: "v1", // API version for versioned apps
  clientOptions: {
    trackHistory: true, // Track tool call history
    timeout: 5000, // Timeout in ms
  },
});

// Use the environment
const result = await env.client.callTool("greet", { name: "Test" });

// Access the server
console.log(env.server.url); // http://localhost:3001

// Cleanup when done
await env.cleanup();
```

### TestEnvironmentBuilder

Fluent API for building test environments:

```ts
import { TestEnvironmentBuilder } from "@mcp-apps-kit/testing";

const env = await new TestEnvironmentBuilder()
  .withApp(app)
  .withPort(3001)
  .withVersion("v1")
  .withClientOptions({ trackHistory: true })
  .build();
```

### Manual Setup

For more control, use `startTestServer` and `createTestClient` directly:

```ts
import { startTestServer, createTestClient } from "@mcp-apps-kit/testing";

// Start server
const server = await startTestServer(app, { port: 3001 });

// Wait for server to be ready
await new Promise((resolve) => setTimeout(resolve, 100));

// Create client (for versioned apps, connect to version endpoint)
const client = await createTestClient(`http://localhost:3001/v1/mcp`, {
  trackHistory: true,
});

// Use client
const result = await client.callTool("greet", { name: "Test" });

// Cleanup
await client.disconnect();
await server.stop();
```

### Client Features

```ts
// Call tools
const result = await client.callTool("greet", { name: "Alice" });

// List available tools
const tools = await client.listTools();
// [{ name: "greet", description: "Greet someone" }]

// Track call history (when trackHistory: true)
const history = client.getCallHistory();
// [{ name: "greet", args: { name: "Alice" }, result: {...}, duration: 15, timestamp: Date }]

// Clear history
client.clearHistory();

// Disconnect
await client.disconnect();
```

## Assertions & Matchers

### expectToolResult

Standalone assertion builder for tool results:

```ts
import { expectToolResult } from "@mcp-apps-kit/testing";

const result = await client.callTool("greet", { name: "Alice" });

// Check for no error
expectToolResult(result).toHaveNoError();

// Check for error
expectToolResult(result).toHaveError();
expectToolResult(result).toHaveError("VALIDATION_ERROR");

// Check text content
expectToolResult(result).toContainText("Alice");

// Validate against Zod schema
const schema = z.object({
  message: z.string(),
  timestamp: z.string(),
});
expectToolResult(result).toMatchSchema(schema);

// Partial object matching
expectToolResult(result).toMatchObject({
  message: "Hello, Alice!",
});
```

### Available Tool Matchers

| Matcher                     | Description                                       |
| --------------------------- | ------------------------------------------------- |
| `.toHaveNoError()`          | Assert result has no error                        |
| `.toHaveError(code?)`       | Assert result has an error (optionally with code) |
| `.toContainText(text)`      | Assert result contains text                       |
| `.toMatchSchema(zodSchema)` | Validate result against Zod schema                |
| `.toMatchObject(expected)`  | Partial object matching                           |

### expectResource

Standalone assertion builder for MCP resource results:

```ts
import { expectResource } from "@mcp-apps-kit/testing";

const result = await client.readResource("file:///config.json");

// Check for content
expectResource(result).toHaveContent();

// Check text content
expectResource(result).toContainText("apiKey");

// Check MIME type
expectResource(result).toHaveMimeType("application/json");

// Validate JSON against Zod schema
const schema = z.object({ apiKey: z.string() });
expectResource(result).toMatchSchema(schema);

// Partial object matching
expectResource(result).toMatchObject({ apiKey: "sk-..." });
```

### Available Resource Matchers

| Matcher                     | Description                              |
| --------------------------- | ---------------------------------------- |
| `.toHaveContent()`          | Assert resource has content              |
| `.toContainText(text)`      | Assert resource contains text            |
| `.toHaveMimeType(mimeType)` | Assert resource has specific MIME type   |
| `.toMatchSchema(zodSchema)` | Validate JSON content against Zod schema |
| `.toMatchObject(expected)`  | Partial object matching for JSON content |

### expectPrompt

Standalone assertion builder for MCP prompt results:

```ts
import { expectPrompt } from "@mcp-apps-kit/testing";

const result = await client.getPrompt("code-review", { language: "typescript" });

// Check for messages
expectPrompt(result).toHaveMessages();
expectPrompt(result).toHaveMessageCount(2);

// Check message content
expectPrompt(result).toContainUserMessage("Review this code");
expectPrompt(result).toContainAssistantMessage("I'll analyze");

// Check description
expectPrompt(result).toHaveDescription("Code review prompt");
```

### Available Prompt Matchers

| Matcher                            | Description                                |
| ---------------------------------- | ------------------------------------------ |
| `.toHaveMessages()`                | Assert prompt has messages                 |
| `.toHaveMessageCount(count)`       | Assert prompt has specific number of msgs  |
| `.toContainUserMessage(text)`      | Assert user message contains text          |
| `.toContainAssistantMessage(text)` | Assert assistant message contains text     |
| `.toHaveDescription(desc?)`        | Assert prompt has (optional specific) desc |

## Test Suites

Define declarative test suites for organized testing:

```ts
import { defineTestSuite, runTestSuite } from "@mcp-apps-kit/testing";

const suite = defineTestSuite({
  name: "Greet Tool Suite",
  tool: "greet",

  // Optional hooks
  beforeEach: async () => {
    console.log("Before each test");
  },
  afterEach: async () => {
    console.log("After each test");
  },

  // Test cases
  cases: [
    {
      name: "greets Alice",
      input: { name: "Alice" },
      expected: { message: "Hello, Alice!" },
    },
    {
      name: "greets Bob",
      input: { name: "Bob" },
      expected: { message: "Hello, Bob!" },
    },
    {
      name: "skipped test",
      input: { name: "Skip" },
      skip: true, // Skip this test
    },
    {
      name: "handles empty name",
      input: { name: "" },
      expectError: { code: "VALIDATION_ERROR" },
    },
  ],
});

// Run the suite
const results = await runTestSuite(client, suite);

console.log(`${results.passed}/${results.total} passed`);
console.log(`Skipped: ${results.skipped}`);
console.log(`Duration: ${results.duration}ms`);
```

## Property-Based Testing

Discover edge cases with randomly generated inputs:

```ts
import { generators, forAllInputs } from "@mcp-apps-kit/testing";

// Built-in generators
const stringGen = generators.string({ minLength: 1, maxLength: 50 });
const intGen = generators.integer(1, 100);
const boolGen = generators.boolean();
const oneOfGen = generators.oneOf("a", "b", "c");

// Run property tests
await forAllInputs(
  generators.string({ minLength: 1, maxLength: 20 }),
  async (name) => {
    const result = await client.callTool("greet", { name });
    // Property: result should always contain the input name
    return result.content[0]?.text?.includes(name) ?? false;
  },
  { numRuns: 100, seed: 12345 }
);
```

### Available Generators

| Generator                         | Description                            |
| --------------------------------- | -------------------------------------- |
| `generators.string(options?)`     | Random strings with length constraints |
| `generators.integer(min?, max?)`  | Random integers                        |
| `generators.float(min?, max?)`    | Random floating-point numbers          |
| `generators.boolean()`            | Random booleans                        |
| `generators.array(gen, options?)` | Arrays of generated values             |
| `generators.object(shape)`        | Objects with generated properties      |
| `generators.oneOf(...values)`     | One of the provided values             |
| `generators.optional(gen)`        | Optional (possibly undefined) values   |

## UI Widget Testing

Test React UI widgets with `@testing-library/react`:

```tsx
// tests/ui-widget.test.tsx
/**
 * @vitest-environment jsdom
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

// Mock the hooks
const mockToolResult = vi.fn();
const mockAppsClient = vi.fn();

vi.mock("@mcp-apps-kit/ui-react", () => ({
  useToolResult: () => mockToolResult(),
  useHostContext: () => ({ theme: "light" }),
  useAppsClient: () => mockAppsClient(),
}));

import { GreetingWidget } from "../src/ui/GreetingWidget";

describe("GreetingWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should display greeting when result is provided", () => {
    mockToolResult.mockReturnValue({
      greet: { message: "Hello, Alice!", timestamp: new Date().toISOString() },
    });

    render(<GreetingWidget />);

    expect(screen.getByText("Hello, Alice!")).toBeInTheDocument();
  });

  it("should call tool when user submits", async () => {
    mockToolResult.mockReturnValue(undefined);
    const mockCallGreet = vi.fn().mockResolvedValue({ message: "Hello!" });
    mockAppsClient.mockReturnValue({ tools: { callGreet: mockCallGreet } });

    render(<GreetingWidget />);

    await userEvent.click(screen.getByText("Greet Someone"));
    await userEvent.type(screen.getByPlaceholderText("Your name"), "Test");
    await userEvent.click(screen.getByText("Greet"));

    await waitFor(() => {
      expect(mockCallGreet).toHaveBeenCalledWith({ name: "Test" });
    });
  });
});
```

### Setup for UI Testing

```bash
npm install -D @testing-library/react @testing-library/jest-dom jsdom
```

```ts
// tests/setup.ts
import "@testing-library/jest-dom/vitest";
```

## Mock Host Environment

Test UI behavior without a browser using `createMockHost`:

```ts
import { createMockHost } from "@mcp-apps-kit/testing";

// Create mock host
const mockHost = createMockHost({
  initialContext: { theme: "dark" },
});

// Theme management
mockHost.setTheme("light");
expect(mockHost.getTheme()).toBe("light");

// Simulate tool calls
mockHost.simulateToolCall("greet", { name: "Test" });

// Emit tool results
mockHost.emitToolResult({ message: "Hello, Test!" });

// Register event handlers
const unsubscribe = mockHost.onToolCall((name, args) => {
  console.log(`Tool called: ${name}`, args);
});

mockHost.onToolResult((result) => {
  console.log("Got result:", result);
});

mockHost.onTeardown((reason) => {
  console.log("Teardown:", reason);
});

// Check history
const history = mockHost.getToolCallHistory();
expect(history).toHaveLength(1);

// Clear history
mockHost.clearHistory();

// Unsubscribe handler
unsubscribe();
```

## LLM Evaluation

### MCP Eval (Recommended)

The recommended way to evaluate MCP tools is to let an LLM actually **use** the tools to complete tasks, then assert on the results. This tests the full integration between an AI agent and your MCP server.

```ts
import { it, expect, beforeAll, afterAll } from "vitest";
import { setupMCPEval, describeEval } from "@mcp-apps-kit/testing";
import { app } from "./app";

// describeEval auto-skips tests if OPENAI_API_KEY is not set
describeEval("MCP Eval Tests", () => {
  let mcpEval;

  beforeAll(async () => {
    mcpEval = await setupMCPEval(app, { 
      version: "v1",
      model: "gpt-4o-mini",
    });
  });

  afterAll(async () => {
    await mcpEval.cleanup();
  });

  it("should greet Alice", async () => {
    const result = await mcpEval.run("Please greet Alice");

    // Assert tool was called with correct args
    expect(result.toolCalls).toContainEqual(
      expect.objectContaining({ name: "greet", args: { name: "Alice" }, success: true })
    );

    // Judge the response
    const judgment = await result.judge("Should be friendly");
    expect(judgment.pass).toBe(true);
  });
});
```

#### Manual Setup

For more control, use `createMCPEval` with a pre-configured client:

```ts
import { createMCPEval, startTestServer, createTestClient } from "@mcp-apps-kit/testing";

const server = await startTestServer(app, { port: 3001 });
const client = await createTestClient("http://localhost:3001/v1/mcp");

const mcpEval = createMCPEval(client, { model: "gpt-4o-mini" });
// ... use mcpEval.run() ...

await client.disconnect();
await server.stop();
```

#### MCP Eval Output

When `verbose: true`, the evaluator automatically reports results:

```
[MCP EVAL] Please greet Alice
  Tools: ✓ greet({"name":"Alice"})
  Response: Hello, Alice!
  Duration: 1406ms
  Judge: [PASS] (100%) - The agent successfully greeted Alice with a friendly message.
```

#### setupMCPEval Options

| Option         | Type    | Default        | Description                          |
| -------------- | ------- | -------------- | ------------------------------------ |
| `version`      | string  | -              | API version (e.g., "v1", "v2")       |
| `port`         | number  | auto           | Server port (auto-assigned if not set) |
| `model`        | string  | `gpt-4o-mini`  | OpenAI model to use                  |
| `apiKey`       | string  | env var        | OpenAI API key                       |
| `maxTokens`    | number  | `1024`         | Maximum tokens for response          |
| `systemPrompt` | string  | -              | Custom system prompt for the agent   |
| `verbose`      | boolean | `true`         | Enable console output                |

#### ToolCallRecord Properties

Each tool call in `result.toolCalls` contains:

| Property  | Type                    | Description                    |
| --------- | ----------------------- | ------------------------------ |
| `name`    | string                  | Tool name                      |
| `args`    | Record<string, unknown> | Arguments passed to the tool   |
| `result`  | unknown                 | Result returned by the tool    |
| `success` | boolean                 | Whether the tool call succeeded |
| `error`   | string \| undefined     | Error message if failed        |

#### JudgeResult Properties

The `result.judge()` method returns:

| Property      | Type    | Description                         |
| ------------- | ------- | ----------------------------------- |
| `pass`        | boolean | Whether the response passes criteria |
| `score`       | number  | Score from 0-1                      |
| `explanation` | string  | Explanation from the judge          |

### Output Quality Evaluation

For evaluating tool output quality without agent interaction, use the LLM evaluator with criteria:

```ts
import { createLLMEvaluator, criteria } from "@mcp-apps-kit/testing";

// Create evaluator (requires OPENAI_API_KEY or ANTHROPIC_API_KEY)
const evaluator = createLLMEvaluator({
  provider: "openai", // or "anthropic"
  model: "gpt-4o-mini", // or "claude-3-haiku-20240307"
});

// Evaluate with built-in criteria
const result = await client.callTool("search_restaurants", { location: "NYC" });

const evaluation = await evaluator.evaluate(result, {
  criteria: [
    criteria.accuracy("Returns accurate restaurant data"),
    criteria.relevance("Results match the search location"),
    criteria.completeness("Includes name, rating, and address"),
    criteria.safety(),
  ],
});

console.log(`Overall: ${evaluation.overall.score}`);
for (const [name, criterion] of Object.entries(evaluation.criteria)) {
  console.log(`${name}: ${criterion.score} - ${criterion.explanation}`);
}

// Custom evaluation with prompt
const custom = await evaluator.evaluateWithPrompt(result, {
  prompt: "Rate this restaurant list from 1-10 for usefulness",
});
```

### Built-in Criteria

| Criterion                            | Description                                  |
| ------------------------------------ | -------------------------------------------- |
| `criteria.accuracy(desc)`            | Measures correctness (threshold: 0.7)        |
| `criteria.relevance(desc)`           | Measures relevance to input (threshold: 0.7) |
| `criteria.completeness(desc)`        | Measures completeness (threshold: 0.7)       |
| `criteria.safety(desc?)`             | Measures safety (threshold: 0.9)             |
| `criteria.custom(name, desc, opts?)` | Custom criterion                             |

## Framework Integration

### Vitest Matchers

```ts
// vitest.setup.ts
import { setupVitestMatchers } from "@mcp-apps-kit/testing/vitest";
setupVitestMatchers();
```

```ts
// In your tests
import { expect } from "vitest";

const result = await client.callTool("greet", { name: "Alice" });

expect(result).toBeSuccessfulToolResult();
expect(result).toContainToolText("Alice");
expect(result).toMatchToolSchema(outputSchema);
expect(result).toMatchToolObject({ message: "Hello, Alice!" });
```

### Jest Matchers

```ts
// jest.setup.js
import { setupJestMatchers } from "@mcp-apps-kit/testing/jest";
setupJestMatchers();
```

```ts
// In your tests
const result = await client.callTool("greet", { name: "Alice" });

expect(result).toBeSuccessfulToolResult();
expect(result).toContainToolText("Alice");
```

### Available Framework Matchers

| Matcher                        | Description                 |
| ------------------------------ | --------------------------- |
| `.toBeSuccessfulToolResult()`  | Assert result has no error  |
| `.toHaveToolError(code?)`      | Assert result has an error  |
| `.toContainToolText(text)`     | Assert result contains text |
| `.toMatchToolSchema(schema)`   | Validate against Zod schema |
| `.toMatchToolObject(expected)` | Partial object matching     |

## API Reference

### Server Utilities

| Function                          | Description                      |
| --------------------------------- | -------------------------------- |
| `startTestServer(app, options?)`  | Start server from App instance   |
| `startTestServer(options)`        | Start external server process    |
| `createTestClient(url, options?)` | Create test client               |
| `createTestEnvironment(options)`  | Create complete test environment |
| `TestEnvironmentBuilder`          | Fluent builder for environments  |

### Behavior Testing

| Function                      | Description                       |
| ----------------------------- | --------------------------------- |
| `expectToolResult(result)`    | Create tool assertion builder     |
| `expectResource(result)`      | Create resource assertion builder |
| `expectPrompt(result)`        | Create prompt assertion builder   |
| `defineTestSuite(config)`     | Define test suite                 |
| `runTestSuite(client, suite)` | Run test suite                    |

### Property Testing

| Function                              | Description        |
| ------------------------------------- | ------------------ |
| `generators`                          | Value generators   |
| `forAllInputs(gen, predicate, opts?)` | Run property tests |

### UI Testing

| Function                   | Description                  |
| -------------------------- | ---------------------------- |
| `createMockHost(options?)` | Create mock host environment |

### LLM Evaluation

| Function                     | Description                                |
| ---------------------------- | ------------------------------------------ |
| `setupMCPEval(app, config)`  | Setup MCP evaluator from app (simplified)  |
| `createMCPEval(client, cfg)` | Create MCP evaluator from client (manual)  |
| `describeEval`               | `describe` that skips if no API key        |
| `hasOpenAIKey()`             | Check if OPENAI_API_KEY is set             |
| `createLLMEvaluator(config)` | Create LLM evaluator for output quality    |
| `criteria`                   | Built-in evaluation criteria               |

### Framework Adapters

| Function                | Import Path                    |
| ----------------------- | ------------------------------ |
| `setupVitestMatchers()` | `@mcp-apps-kit/testing/vitest` |
| `setupJestMatchers()`   | `@mcp-apps-kit/testing/jest`   |

## Examples

See the `examples/minimal` directory for comprehensive test examples:

- `tests/greet-v1.test.ts` - Basic tool testing
- `tests/greet-v2.test.ts` - Testing with input variations
- `tests/versioning.test.ts` - Testing versioned APIs
- `tests/integration.test.ts` - Integration testing
- `tests/advanced-features.test.ts` - Test suites, property testing, mock host
- `tests/ui-widget.test.tsx` - UI component testing
- `tests/eval.test.ts` - MCP evaluation with LLM agent and judge

## Contributing

See `../../CONTRIBUTING.md` for development setup and guidelines. Issues and pull requests are welcome.

## License

MIT
