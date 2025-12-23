/**
 * Minimal Example App
 *
 * A simple "hello world" example demonstrating basic @apps-builder/core usage:
 * - Simple tool definition with Zod schema
 * - UI resource binding
 * - Server startup
 */

import { createApp } from "@apps-builder/core";
import { z } from "zod";

const app = createApp({
  name: "minimal-app",
  version: "1.0.0",

  tools: {
    greet: {
      title: "Greet",
      description: "Greet someone by name",
      input: z.object({
        name: z.string().describe("Name to greet"),
      }),
      output: z.object({
        message: z.string(),
        timestamp: z.string(),
      }),
      ui: "greeting-widget",
      visibility: "both",
      handler: async ({ name }) => {
        const message = `Hello, ${name}!`;
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
