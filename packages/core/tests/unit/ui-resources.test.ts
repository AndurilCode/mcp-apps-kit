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
import { createApp, defineUI, defineTool } from "../../src/index";
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
    it("should create app with colocated UI resources", () => {
      const testTool = defineTool({
        description: "Test tool",
        input: z.object({}),
        output: z.object({}),
        handler: async () => ({}),
        ui: defineUI({
          html: "<div>Hello World</div>",
        }),
      });

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          test: testTool,
        },
      });

      expect(app).toBeDefined();
      expect(app.tools.test.ui).toEqual({
        html: "<div>Hello World</div>",
      });
    });

    it("should support UI resources with CSP configuration", () => {
      const apiTool = defineTool({
        description: "API tool",
        input: z.object({}),
        output: z.object({}),
        handler: async () => ({}),
        ui: defineUI({
          html: "<div>API Widget</div>",
          csp: {
            connectDomains: ["https://api.example.com"],
            resourceDomains: ["https://cdn.example.com"],
          },
        }),
      });

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          api: apiTool,
        },
      });

      const ui = app.tools.api.ui as { csp: { connectDomains: string[] } };
      expect(ui.csp).toBeDefined();
      expect(ui.csp.connectDomains).toEqual(["https://api.example.com"]);
    });

    it("should support UI resources with prefersBorder", () => {
      const borderedTool = defineTool({
        description: "Bordered tool",
        input: z.object({}),
        output: z.object({}),
        handler: async () => ({}),
        ui: defineUI({
          html: "<div>Bordered</div>",
          prefersBorder: true,
        }),
      });

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          bordered: borderedTool,
        },
      });

      const ui = app.tools.bordered.ui as { prefersBorder: boolean };
      expect(ui.prefersBorder).toBe(true);
    });

    it("should support UI resources with name and description", () => {
      const dashboardTool = defineTool({
        description: "Dashboard tool",
        input: z.object({}),
        output: z.object({}),
        handler: async () => ({}),
        ui: defineUI({
          name: "Main Dashboard",
          description: "The primary dashboard view",
          html: "<div>Dashboard</div>",
        }),
      });

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          dashboard: dashboardTool,
        },
      });

      const ui = app.tools.dashboard.ui as { name: string; description: string };
      expect(ui.name).toBe("Main Dashboard");
      expect(ui.description).toBe("The primary dashboard view");
    });
  });

  describe("tool-UI binding", () => {
    it("should allow tools to have colocated UI resources", () => {
      const dashboardUI = defineUI({
        html: "<div>Dashboard</div>",
      });

      const showDashboardTool = defineTool({
        description: "Show the dashboard",
        input: z.object({}),
        output: z.object({ data: z.string() }),
        handler: async () => ({ data: "test" }),
        ui: dashboardUI,
      });

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          showDashboard: showDashboardTool,
        },
      });

      expect(app.tools.showDashboard.ui).toBe(dashboardUI);
    });
  });

  describe("multiple UI resources", () => {
    it("should support multiple tools with colocated UI", () => {
      const listTool = defineTool({
        description: "List view",
        input: z.object({}),
        output: z.object({}),
        handler: async () => ({}),
        ui: defineUI({ html: "<div>List</div>" }),
      });

      const detailTool = defineTool({
        description: "Detail view",
        input: z.object({}),
        output: z.object({}),
        handler: async () => ({}),
        ui: defineUI({ html: "<div>Detail</div>", prefersBorder: true }),
      });

      const formTool = defineTool({
        description: "Form view",
        input: z.object({}),
        output: z.object({}),
        handler: async () => ({}),
        ui: defineUI({
          html: "<div>Form</div>",
          csp: { connectDomains: ["https://api.example.com"] },
        }),
      });

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          listView: listTool,
          detailView: detailTool,
          formView: formTool,
        },
      });

      expect(app.tools.listView.ui).toBeDefined();
      expect(app.tools.detailView.ui).toBeDefined();
      expect(app.tools.formView.ui).toBeDefined();
    });
  });

  describe("ChatGPT-only CSP fields", () => {
    it("should accept redirectDomains for ChatGPT compatibility", () => {
      const widgetTool = defineTool({
        description: "Widget tool",
        input: z.object({}),
        output: z.object({}),
        handler: async () => ({}),
        ui: defineUI({
          html: "<div>Widget</div>",
          csp: {
            connectDomains: ["https://api.example.com"],
            redirectDomains: ["https://docs.example.com"],
          },
        }),
      });

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: { widget: widgetTool },
      });

      const ui = app.tools.widget.ui as { csp: { redirectDomains: string[] } };
      expect(ui.csp.redirectDomains).toEqual(["https://docs.example.com"]);
    });

    it("should accept frameDomains for ChatGPT compatibility", () => {
      const widgetTool = defineTool({
        description: "Widget tool",
        input: z.object({}),
        output: z.object({}),
        handler: async () => ({}),
        ui: defineUI({
          html: "<div>Widget</div>",
          csp: {
            frameDomains: ["https://embed.example.com"],
          },
        }),
      });

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: { widget: widgetTool },
      });

      const ui = app.tools.widget.ui as { csp: { frameDomains: string[] } };
      expect(ui.csp.frameDomains).toEqual(["https://embed.example.com"]);
    });

    it("should accept domain for ChatGPT widget isolation", () => {
      const widgetTool = defineTool({
        description: "Widget tool",
        input: z.object({}),
        output: z.object({}),
        handler: async () => ({}),
        ui: defineUI({
          html: "<div>Widget</div>",
          domain: "widget.example.com",
        }),
      });

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: { widget: widgetTool },
      });

      const ui = app.tools.widget.ui as { domain: string };
      expect(ui.domain).toBe("widget.example.com");
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
      const widgetUI = defineUI({
        html: "<div>Widget</div>",
        csp: {
          connectDomains: ["https://api.example.com"],
        },
      });

      const testTool = defineTool({
        description: "Test tool",
        input: z.object({}),
        output: z.object({}),
        handler: async () => ({}),
        ui: widgetUI,
      });

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          test: testTool,
        },
        config: {
          protocol: "mcp",
        },
      });

      expect(app).toBeDefined();
      expect(app.tools.test.ui).toBe(widgetUI);
    });

    it("should accept OpenAI protocol configuration", () => {
      const widgetUI = defineUI({
        html: "<div>Widget</div>",
        csp: {
          connectDomains: ["https://api.example.com"],
          redirectDomains: ["https://docs.example.com"],
        },
        domain: "widget.example.com",
      });

      const testTool = defineTool({
        description: "Test tool",
        input: z.object({}),
        output: z.object({}),
        handler: async () => ({}),
        ui: widgetUI,
        invokingMessage: "Loading...",
        invokedMessage: "Done!",
      });

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          test: testTool,
        },
        config: {
          protocol: "openai",
        },
      });

      expect(app).toBeDefined();
      expect(app.tools.test.ui).toBe(widgetUI);
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

  describe("defineUI helper", () => {
    it("should return the same UI definition passed in", () => {
      const uiDef = defineUI({
        html: "<div>Test</div>",
        name: "Test Widget",
        prefersBorder: true,
      });

      expect(uiDef.html).toBe("<div>Test</div>");
      expect(uiDef.name).toBe("Test Widget");
      expect(uiDef.prefersBorder).toBe(true);
    });

    it("should preserve all CSP configuration", () => {
      const uiDef = defineUI({
        html: "<div>API Widget</div>",
        csp: {
          connectDomains: ["https://api.example.com"],
          resourceDomains: ["https://cdn.example.com"],
          redirectDomains: ["https://docs.example.com"],
          frameDomains: ["https://embed.example.com"],
        },
      });

      expect(uiDef.csp?.connectDomains).toEqual(["https://api.example.com"]);
      expect(uiDef.csp?.resourceDomains).toEqual(["https://cdn.example.com"]);
      expect(uiDef.csp?.redirectDomains).toEqual(["https://docs.example.com"]);
      expect(uiDef.csp?.frameDomains).toEqual(["https://embed.example.com"]);
    });
  });

  describe("colocated UI pattern", () => {
    it("should accept inline UIDef in tool definition", () => {
      // Use defineTool for proper type inference with inline UI
      const greetTool = defineTool({
        description: "Greet someone",
        input: z.object({ name: z.string() }),
        output: z.object({ message: z.string() }),
        handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
        ui: defineUI({
          html: "<div>Greeting Widget</div>",
          prefersBorder: true,
        }),
      });

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          greet: greetTool,
        },
      });

      expect(app).toBeDefined();
      // The original tool definition preserves the inline UIDef
      expect(app.tools.greet.ui).toEqual({
        html: "<div>Greeting Widget</div>",
        prefersBorder: true,
      });
    });

    it("should support shared UI across multiple tools", () => {
      const sharedListUI = defineUI({
        html: "<div>List View</div>",
        name: "Shared List",
        csp: {
          connectDomains: ["https://api.example.com"],
        },
      });

      const searchTool = defineTool({
        description: "Search for items",
        input: z.object({ query: z.string() }),
        output: z.object({ items: z.array(z.string()) }),
        handler: async () => ({ items: [] }),
        ui: sharedListUI,
      });

      const filterTool = defineTool({
        description: "Filter items",
        input: z.object({ filter: z.string() }),
        output: z.object({ items: z.array(z.string()) }),
        handler: async () => ({ items: [] }),
        ui: sharedListUI,
      });

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          searchItems: searchTool,
          filterItems: filterTool,
        },
      });

      // Both tools reference the same shared UI definition
      expect(app.tools.searchItems.ui).toBe(sharedListUI);
      expect(app.tools.filterItems.ui).toBe(sharedListUI);
    });

    it("should work with defineTool helper for full type inference", () => {
      const greetTool = defineTool({
        description: "Greet someone",
        input: z.object({ name: z.string() }),
        output: z.object({ message: z.string() }),
        handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
        ui: defineUI({
          html: "<div>Greeting</div>",
        }),
      });

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          greet: greetTool,
        },
      });

      expect(app.tools.greet.ui).toEqual({
        html: "<div>Greeting</div>",
      });
    });

    it("should allow mixing inline UI and shared UI definitions", () => {
      // Shared UI definition that can be used by multiple tools
      const sharedUI = defineUI({
        html: "<div>Shared Widget</div>",
      });

      const inlineTool = defineTool({
        description: "Tool with inline UI",
        input: z.object({}),
        output: z.object({ result: z.string() }),
        handler: async () => ({ result: "inline" }),
        ui: defineUI({
          html: "<div>Inline UI</div>",
        }),
      });

      const sharedTool = defineTool({
        description: "Tool with shared UI reference",
        input: z.object({}),
        output: z.object({ result: z.string() }),
        handler: async () => ({ result: "shared" }),
        ui: sharedUI,
      });

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          inlineTool,
          sharedTool,
        },
      });

      // Inline UI is preserved as object
      expect(app.tools.inlineTool.ui).toEqual({
        html: "<div>Inline UI</div>",
      });
      // Shared UI reference is preserved
      expect(app.tools.sharedTool.ui).toBe(sharedUI);
    });

    it("should support all UIDef properties in inline definition", () => {
      const fullFeatureTool = defineTool({
        description: "Full feature tool",
        input: z.object({}),
        output: z.object({}),
        handler: async () => ({}),
        ui: defineUI({
          html: "<div>Full Feature</div>",
          name: "Full Feature Widget",
          description: "A widget with all features",
          widgetDescription: "Interactive widget for full features",
          prefersBorder: true,
          domain: "widget.example.com",
          csp: {
            connectDomains: ["https://api.example.com"],
            resourceDomains: ["https://cdn.example.com"],
            redirectDomains: ["https://docs.example.com"],
            frameDomains: ["https://embed.example.com"],
          },
        }),
      });

      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          fullFeature: fullFeatureTool,
        },
      });

      const ui = app.tools.fullFeature.ui as {
        html: string;
        name: string;
        description: string;
        widgetDescription: string;
        prefersBorder: boolean;
        domain: string;
        csp: {
          connectDomains: string[];
          resourceDomains: string[];
          redirectDomains: string[];
          frameDomains: string[];
        };
      };

      expect(ui.html).toBe("<div>Full Feature</div>");
      expect(ui.name).toBe("Full Feature Widget");
      expect(ui.description).toBe("A widget with all features");
      expect(ui.widgetDescription).toBe("Interactive widget for full features");
      expect(ui.prefersBorder).toBe(true);
      expect(ui.domain).toBe("widget.example.com");
      expect(ui.csp.connectDomains).toEqual(["https://api.example.com"]);
    });
  });
});
