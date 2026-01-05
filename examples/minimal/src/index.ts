/**
 * Minimal Example App with Versioning Support
 *
 * Demonstrates @mcp-apps-kit/core versioning feature:
 * - v1: Simple greet tool with just name
 * - v2: Enhanced greet tool with name + optional surname
 * - Shared config (CORS, debug) across versions
 * - Each version exposed at /v1/mcp and /v2/mcp
 */

import { createApp, defineTool, type ClientToolsFromCore } from "@mcp-apps-kit/core";
import { defineReactUI } from "@mcp-apps-kit/ui-react-builder";
import { GreetingWidgetV1 } from "./ui/GreetingWidgetV1";
import { GreetingWidgetV2 } from "./ui/GreetingWidgetV2";
import { z } from "zod";

// =============================================================================
// V1: Simple greet tool (name only)
// =============================================================================

const greetInputV1 = z.object({
  name: z.string().describe("Name to greet"),
});

const greetOutputV1 = z.object({
  message: z.string(),
  timestamp: z.string(),
});

const greetToolV1 = defineTool({
  title: "Greet",
  description: "Greet someone by name",
  input: greetInputV1,
  output: greetOutputV1,
  visibility: "both",

  ui: defineReactUI({
    component: GreetingWidgetV1,
    name: "Greeting Widget V1",
    description: "Displays greeting messages (v1 - name only)",
    prefersBorder: true,
  }),

  handler: async (input, context) => {
    const userInfo = context.subject ? ` (authenticated as ${context.subject})` : "";
    const message = `Hello, ${input.name}${userInfo}!`;

    return {
      message,
      timestamp: new Date().toISOString(),
      _text: message,
    };
  },
});

// =============================================================================
// V2: Enhanced greet tool (name + optional surname)
// =============================================================================

const greetInputV2 = z.object({
  name: z.string().describe("First name to greet"),
  surname: z.string().optional().describe("Optional surname"),
});

const greetOutputV2 = z.object({
  message: z.string(),
  fullName: z.string(),
  timestamp: z.string(),
});

const greetToolV2 = defineTool({
  title: "Greet",
  description: "Greet someone by name and optional surname",
  input: greetInputV2,
  output: greetOutputV2,
  visibility: "both",

  ui: defineReactUI({
    component: GreetingWidgetV2,
    name: "Greeting Widget V2",
    description: "Displays greeting messages (v2 - with surname support)",
    prefersBorder: true,
  }),

  handler: async (input, context) => {
    const fullName = input.surname ? `${input.name} ${input.surname}` : input.name;
    const userInfo = context.subject ? ` (authenticated as ${context.subject})` : "";
    const message = `Hello, ${fullName}${userInfo}!`;

    return {
      message,
      fullName,
      timestamp: new Date().toISOString(),
      _text: message,
    };
  },
});

// =============================================================================
// Create Versioned App
// =============================================================================

const app = createApp({
  name: "minimal-app",

  // Shared config across all versions
  config: {
    cors: {
      origin: true,
    },
    protocol: "mcp",
    debug: {
      logTool: true,
      level: "info",
    },
  },

  // Version definitions
  versions: {
    v1: {
      version: "1.0.0",
      tools: {
        greet: greetToolV1,
      },
    },
    v2: {
      version: "2.0.0",
      tools: {
        greet: greetToolV2,
      },
    },
  },
});

const port = parseInt(process.env.PORT || "3000");

app.start({ port }).then(() => {
  const versions = app.getVersions();
  console.log(`
Minimal Example Server with Versioning running on http://localhost:${port}

Available API versions: ${versions.join(", ")}

Endpoints:
  - v1 MCP: http://localhost:${port}/v1/mcp (name only)
  - v2 MCP: http://localhost:${port}/v2/mcp (name + surname)
  - Health:  http://localhost:${port}/health

Try it:
  curl -X POST http://localhost:${port}/v1/mcp -H "Content-Type: application/json" \\
    -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"greet","arguments":{"name":"World"}},"id":1}'

  curl -X POST http://localhost:${port}/v2/mcp -H "Content-Type: application/json" \\
    -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"greet","arguments":{"name":"John","surname":"Doe"}},"id":1}'
  `);
});

// =============================================================================
// Export types for UI
// =============================================================================

// V1 types
export type AppToolsV1 = { greet: typeof greetToolV1 };
export type AppClientToolsV1 = ClientToolsFromCore<AppToolsV1>;
export type GreetInputV1 = z.infer<typeof greetInputV1>;
export type GreetOutputV1 = z.infer<typeof greetOutputV1>;

// V2 types
export type AppToolsV2 = { greet: typeof greetToolV2 };
export type AppClientToolsV2 = ClientToolsFromCore<AppToolsV2>;
export type GreetInputV2 = z.infer<typeof greetInputV2>;
export type GreetOutputV2 = z.infer<typeof greetOutputV2>;
