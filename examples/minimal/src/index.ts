/**
 * Minimal Example App
 *
 * A simple "hello world" example demonstrating basic @mcp-apps-kit/core usage:
 * - Simple tool definition with Zod schema
 * - UI resource binding
 * - Server startup
 * - Type-safe handlers using defineTool helper (no type assertions needed!)
 */

import { createApp, defineTool } from "@mcp-apps-kit/core";
import { z } from "zod";

// Define schemas separately for clarity
const greetInput = z.object({
  name: z.string().describe("Name to greet"),
});

const greetOutput = z.object({
  message: z.string(),
  timestamp: z.string(),
});

// Use defineTool for full type safety - no type assertions needed!
const greetTool = defineTool({
  title: "Greet",
  description: "Greet someone by name",
  input: greetInput,
  output: greetOutput,
  ui: "greeting-widget",
  visibility: "both",
  handler: async (input, context) => {
    // input is automatically typed as { name: string }
    // No type assertion needed! ✅
    const message = `Hello, ${input.name}!`;
    return {
      message,
      timestamp: new Date().toISOString(),
      _text: message,
    };
  },
});

const app = createApp({
  name: "minimal-app",
  version: "1.0.0",

  tools: {
    greet: greetTool,
  },

  ui: {
    "greeting-widget": {
      name: "Greeting Widget",
      description: "Displays greeting messages",
      html: "./src/ui/dist/index.html",
      prefersBorder: true,
    },
  },

  config: {
    cors: {
      origin: true,
    },
    protocol: "mcp",
  },
});

const port = parseInt(process.env.PORT || "3000");

app.start({ port }).then(() => {
  console.log(`
Minimal Example Server running on http://localhost:${port}
MCP endpoint: http://localhost:${port}/mcp
Health check: http://localhost:${port}/health
  `);
});
