/**
 * Minimal Example App
 *
 * A simple "hello world" example demonstrating basic @mcp-apps-kit/core usage:
 * - Simple tool definition with Zod schema
 * - UI resource binding
 * - Server startup
 */

import { createApp } from "@mcp-apps-kit/core";
import { z } from "zod";

// Define schemas separately for better type inference with Zod v4
const greetInput = z.object({
  name: z.string().describe("Name to greet"),
});

const greetOutput = z.object({
  message: z.string(),
  timestamp: z.string(),
});

const app = createApp({
  name: "minimal-app",
  version: "1.0.0",

  tools: {
    greet: {
      title: "Greet",
      description: "Greet someone by name",
      input: greetInput,
      output: greetOutput,
      ui: "greeting-widget",
      visibility: "both",
      handler: async (input) => {
        const typedInput = input as z.infer<typeof greetInput>;
        const message = `Hello, ${typedInput.name}!`;
        return {
          message,
          timestamp: new Date().toISOString(),
          _text: message,
        };
      },
    },
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
