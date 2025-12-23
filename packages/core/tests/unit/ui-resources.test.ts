/**
 * Unit tests for UI resource registration
 *
 * Tests UI resource registration with the MCP server including:
 * - Resource registration with proper URI format
 * - CSP metadata inclusion
 * - Inline HTML and file path handling
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { z } from "zod";
import { createApp } from "../../src/index";
import * as fs from "node:fs";
import * as path from "node:path";

// Mock fs module
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}));

describe("UI Resource Registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("resource creation", () => {
    it("should create app with UI resources", () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          test: {
            description: "Test tool",
            input: z.object({}),
            output: z.object({}),
            handler: async () => ({}),
          },
        },
        ui: {
          "main-widget": {
            html: "<div>Hello World</div>",
          },
        },
      });

      expect(app).toBeDefined();
      expect(app.ui).toBeDefined();
      expect(app.ui!["main-widget"]).toBeDefined();
    });

    it("should support UI resources with CSP configuration", () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {},
        ui: {
          "api-widget": {
            html: "<div>API Widget</div>",
            csp: {
              connectDomains: ["https://api.example.com"],
              resourceDomains: ["https://cdn.example.com"],
            },
          },
        },
      });

      expect(app.ui!["api-widget"].csp).toBeDefined();
      expect(app.ui!["api-widget"].csp!.connectDomains).toEqual(["https://api.example.com"]);
    });

    it("should support UI resources with prefersBorder", () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {},
        ui: {
          "bordered-widget": {
            html: "<div>Bordered</div>",
            prefersBorder: true,
          },
        },
      });

      expect(app.ui!["bordered-widget"].prefersBorder).toBe(true);
    });

    it("should support UI resources with name and description", () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {},
        ui: {
          dashboard: {
            name: "Main Dashboard",
            description: "The primary dashboard view",
            html: "<div>Dashboard</div>",
          },
        },
      });

      expect(app.ui!.dashboard.name).toBe("Main Dashboard");
      expect(app.ui!.dashboard.description).toBe("The primary dashboard view");
    });
  });

  describe("tool-UI binding", () => {
    it("should allow tools to reference UI resources", () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          showDashboard: {
            description: "Show the dashboard",
            input: z.object({}),
            output: z.object({ data: z.string() }),
            handler: async () => ({ data: "test" }),
            ui: "dashboard",
          },
        },
        ui: {
          dashboard: {
            html: "<div>Dashboard</div>",
          },
        },
      });

      expect(app.tools.showDashboard.ui).toBe("dashboard");
    });
  });

  describe("multiple UI resources", () => {
    it("should support multiple UI resources", () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {},
        ui: {
          "list-view": {
            html: "<div>List</div>",
          },
          "detail-view": {
            html: "<div>Detail</div>",
            prefersBorder: true,
          },
          "form-view": {
            html: "<div>Form</div>",
            csp: {
              connectDomains: ["https://api.example.com"],
            },
          },
        },
      });

      expect(Object.keys(app.ui!)).toHaveLength(3);
      expect(app.ui!["list-view"]).toBeDefined();
      expect(app.ui!["detail-view"]).toBeDefined();
      expect(app.ui!["form-view"]).toBeDefined();
    });
  });

  describe("ChatGPT-only CSP fields", () => {
    it("should accept redirectDomains for ChatGPT compatibility", () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {},
        ui: {
          widget: {
            html: "<div>Widget</div>",
            csp: {
              connectDomains: ["https://api.example.com"],
              redirectDomains: ["https://docs.example.com"],
            },
          },
        },
      });

      expect(app.ui!.widget.csp!.redirectDomains).toEqual(["https://docs.example.com"]);
    });

    it("should accept frameDomains for ChatGPT compatibility", () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {},
        ui: {
          widget: {
            html: "<div>Widget</div>",
            csp: {
              frameDomains: ["https://embed.example.com"],
            },
          },
        },
      });

      expect(app.ui!.widget.csp!.frameDomains).toEqual(["https://embed.example.com"]);
    });

    it("should accept domain for ChatGPT widget isolation", () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {},
        ui: {
          widget: {
            html: "<div>Widget</div>",
            domain: "widget.example.com",
          },
        },
      });

      expect(app.ui!.widget.domain).toBe("widget.example.com");
    });
  });

  describe("protocol configuration", () => {
    it("should default to MCP protocol when not specified", () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          test: {
            description: "Test tool",
            input: z.object({}),
            output: z.object({}),
            handler: async () => ({}),
          },
        },
      });

      // App should be created successfully with default MCP protocol
      expect(app).toBeDefined();
      expect(app.tools.test).toBeDefined();
    });

    it("should accept MCP protocol configuration", () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          test: {
            description: "Test tool",
            input: z.object({}),
            output: z.object({}),
            handler: async () => ({}),
            ui: "widget",
          },
        },
        ui: {
          widget: {
            html: "<div>Widget</div>",
            csp: {
              connectDomains: ["https://api.example.com"],
            },
          },
        },
        config: {
          protocol: "mcp",
        },
      });

      expect(app).toBeDefined();
      expect(app.tools.test.ui).toBe("widget");
    });

    it("should accept OpenAI protocol configuration", () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          test: {
            description: "Test tool",
            input: z.object({}),
            output: z.object({}),
            handler: async () => ({}),
            ui: "widget",
            invokingMessage: "Loading...",
            invokedMessage: "Done!",
          },
        },
        ui: {
          widget: {
            html: "<div>Widget</div>",
            csp: {
              connectDomains: ["https://api.example.com"],
              redirectDomains: ["https://docs.example.com"],
            },
            domain: "widget.example.com",
          },
        },
        config: {
          protocol: "openai",
        },
      });

      expect(app).toBeDefined();
      expect(app.tools.test.ui).toBe("widget");
      expect(app.tools.test.invokingMessage).toBe("Loading...");
      expect(app.tools.test.invokedMessage).toBe("Done!");
    });

    it("should support ChatGPT-specific tool properties with OpenAI protocol", () => {
      const app = createApp({
        name: "chatgpt-app",
        version: "1.0.0",
        tools: {
          search: {
            description: "Search the web",
            input: z.object({ query: z.string() }),
            output: z.object({ results: z.array(z.string()) }),
            handler: async ({ query }) => ({ results: [`Result for: ${query}`] }),
            visibility: "model", // Should map to invokableByAI: true, invokableByApp: false
            invokingMessage: "Searching...",
            invokedMessage: "Search complete!",
          },
        },
        config: {
          protocol: "openai",
        },
      });

      expect(app.tools.search.visibility).toBe("model");
      expect(app.tools.search.invokingMessage).toBe("Searching...");
    });
  });
});
