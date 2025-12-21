/**
 * Unit tests for Express handler
 *
 * Tests the Express middleware that handles MCP protocol requests.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createApp } from "../../src/index";

describe("Express handler", () => {
  describe("handler() method", () => {
    it("should return an Express middleware function", () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {},
      });

      const middleware = app.handler();

      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe("function");
      // Express middleware has (req, res, next) signature
      expect(middleware.length).toBeGreaterThanOrEqual(2);
    });

    it("should be usable with custom Express server", () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          echo: {
            description: "Echo input",
            input: z.object({ text: z.string() }),
            output: z.object({ text: z.string() }),
            handler: async ({ text }: { text: string }) => ({ text }),
          },
        },
      });

      const middleware = app.handler();

      // Middleware should be a function with Express signature
      expect(typeof middleware).toBe("function");
      expect(middleware.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("handleRequest() method", () => {
    it("should return a Response object", async () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {},
      });

      const request = new Request("http://localhost:3000/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "tools/list" }),
      });

      const response = await app.handleRequest(request);

      expect(response).toBeInstanceOf(Response);
      expect(response.headers.get("Content-Type")).toContain("application/json");
    });

    it("should be usable for serverless deployments", async () => {
      const app = createApp({
        name: "serverless-app",
        version: "1.0.0",
        tools: {
          hello: {
            description: "Say hello",
            input: z.object({}),
            output: z.object({ message: z.string() }),
            handler: async () => ({ message: "Hello, serverless!" }),
          },
        },
      });

      const request = new Request("http://localhost:3000/mcp");
      const response = await app.handleRequest(request);

      expect(response).toBeInstanceOf(Response);
    });
  });
});
