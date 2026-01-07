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

## Documentation

See the [quickstart guide](../../specs/001-testing-library/quickstart.md) for detailed examples and API documentation.

## License

MIT
