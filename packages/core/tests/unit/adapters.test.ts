/**
 * Unit tests for protocol adapters
 *
 * Tests MCP and OpenAI adapters for tool and UI resource metadata generation.
 */

import { describe, it, expect } from "vitest";
import { createAdapter, McpAdapter, OpenAIAdapter } from "../../src/adapters";
import type { ToolDef } from "../../src/types/tools";
import type { UIDef } from "../../src/types/ui";
import { z } from "zod";

// =============================================================================
// TEST FIXTURES
// =============================================================================

const sampleToolDef: ToolDef = {
  description: "Greets a user by name",
  input: z.object({ name: z.string() }),
  output: z.object({ message: z.string() }),
  handler: async (input: { name: string }) => ({ message: `Hello, ${input.name}!` }),
};

const sampleUIDef: UIDef = {
  html: "<div>Hello</div>",
  description: "A greeting widget",
};

// =============================================================================
// ADAPTER FACTORY TESTS
// =============================================================================

describe("createAdapter", () => {
  it("should return McpAdapter for 'mcp' protocol", () => {
    const adapter = createAdapter("mcp");
    expect(adapter).toBeInstanceOf(McpAdapter);
  });

  it("should return OpenAIAdapter for 'openai' protocol", () => {
    const adapter = createAdapter("openai");
    expect(adapter).toBeInstanceOf(OpenAIAdapter);
  });
});

// =============================================================================
// MCP ADAPTER TESTS
// =============================================================================

describe("McpAdapter", () => {
  const adapter = new McpAdapter();

  describe("buildToolMeta", () => {
    it("should return visibility under _meta.ui namespace", () => {
      const result = adapter.buildToolMeta(sampleToolDef, "test-server");
      expect(result._meta).toEqual({
        ui: {
          visibility: ["model", "app"],
        },
      });
    });

    it("should map 'model' visibility to ['model']", () => {
      const toolDef = { ...sampleToolDef, visibility: "model" as const };
      const result = adapter.buildToolMeta(toolDef, "test-server");
      expect(result._meta?.ui).toMatchObject({
        visibility: ["model"],
      });
    });

    it("should map 'app' visibility to ['app']", () => {
      const toolDef = { ...sampleToolDef, visibility: "app" as const };
      const result = adapter.buildToolMeta(toolDef, "test-server");
      expect(result._meta?.ui).toMatchObject({
        visibility: ["app"],
      });
    });

    it("should map 'both' visibility to ['model', 'app']", () => {
      const toolDef = { ...sampleToolDef, visibility: "both" as const };
      const result = adapter.buildToolMeta(toolDef, "test-server");
      expect(result._meta?.ui).toMatchObject({
        visibility: ["model", "app"],
      });
    });

    it("should include resourceUri when ui is specified", () => {
      const toolDef = { ...sampleToolDef, ui: "greeting-widget" };
      const uiUri = "ui://test-server/greeting-widget?v=abc12345";
      const result = adapter.buildToolMeta(toolDef, "test-server", uiUri);
      expect(result._meta?.ui).toMatchObject({
        resourceUri: uiUri,
      });
    });

    it("should not include resourceUri when ui is not specified", () => {
      const result = adapter.buildToolMeta(sampleToolDef, "test-server");
      expect(result._meta?.ui).not.toHaveProperty("resourceUri");
    });

    it("should not return annotations when not specified", () => {
      const result = adapter.buildToolMeta(sampleToolDef, "test-server");
      expect(result.annotations).toBeUndefined();
    });

    it("should include readOnlyHint annotation", () => {
      const toolDef = { ...sampleToolDef, annotations: { readOnlyHint: true } };
      const result = adapter.buildToolMeta(toolDef, "test-server");
      expect(result.annotations).toEqual({ readOnlyHint: true });
    });

    it("should include destructiveHint annotation", () => {
      const toolDef = { ...sampleToolDef, annotations: { destructiveHint: true } };
      const result = adapter.buildToolMeta(toolDef, "test-server");
      expect(result.annotations).toEqual({ destructiveHint: true });
    });

    it("should include openWorldHint annotation", () => {
      const toolDef = { ...sampleToolDef, annotations: { openWorldHint: true } };
      const result = adapter.buildToolMeta(toolDef, "test-server");
      expect(result.annotations).toEqual({ openWorldHint: true });
    });

    it("should include idempotentHint annotation", () => {
      const toolDef = { ...sampleToolDef, annotations: { idempotentHint: true } };
      const result = adapter.buildToolMeta(toolDef, "test-server");
      expect(result.annotations).toEqual({ idempotentHint: true });
    });

    it("should include multiple annotations", () => {
      const toolDef = {
        ...sampleToolDef,
        annotations: {
          readOnlyHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
      };
      const result = adapter.buildToolMeta(toolDef, "test-server");
      expect(result.annotations).toEqual({
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      });
    });
  });

  describe("buildUIResourceMeta", () => {
    it("should return correct MIME type for MCP", () => {
      const result = adapter.buildUIResourceMeta(sampleUIDef);
      expect(result.mimeType).toBe("text/html;profile=mcp-app");
    });

    it("should return undefined _meta when no options specified", () => {
      const result = adapter.buildUIResourceMeta(sampleUIDef);
      expect(result._meta).toBeUndefined();
    });

    it("should include CSP in _meta.ui.csp with camelCase keys", () => {
      const uiDef: UIDef = {
        ...sampleUIDef,
        csp: {
          connectDomains: ["https://api.example.com"],
          resourceDomains: ["https://cdn.example.com"],
        },
      };
      const result = adapter.buildUIResourceMeta(uiDef);
      expect(result._meta).toEqual({
        ui: {
          csp: {
            connectDomains: ["https://api.example.com"],
            resourceDomains: ["https://cdn.example.com"],
          },
        },
      });
    });

    it("should include prefersBorder in _meta.ui", () => {
      const uiDef: UIDef = { ...sampleUIDef, prefersBorder: true };
      const result = adapter.buildUIResourceMeta(uiDef);
      expect(result._meta).toEqual({
        ui: {
          prefersBorder: true,
        },
      });
    });

    it("should include domain in _meta.ui", () => {
      const uiDef: UIDef = { ...sampleUIDef, domain: "https://example.com" };
      const result = adapter.buildUIResourceMeta(uiDef);
      expect(result._meta).toEqual({
        ui: {
          domain: "https://example.com",
        },
      });
    });

    it("should combine multiple UI options in _meta.ui", () => {
      const uiDef: UIDef = {
        ...sampleUIDef,
        prefersBorder: false,
        domain: "https://example.com",
        csp: {
          connectDomains: ["https://api.example.com"],
        },
      };
      const result = adapter.buildUIResourceMeta(uiDef);
      expect(result._meta).toEqual({
        ui: {
          csp: {
            connectDomains: ["https://api.example.com"],
          },
          prefersBorder: false,
          domain: "https://example.com",
        },
      });
    });
  });
});

// =============================================================================
// OPENAI ADAPTER TESTS
// =============================================================================

describe("OpenAIAdapter", () => {
  const adapter = new OpenAIAdapter();

  describe("buildToolMeta", () => {
    it("should return visibility with openai/ prefixes", () => {
      const result = adapter.buildToolMeta(sampleToolDef, "test-server");
      expect(result._meta).toMatchObject({
        "openai/visibility": "public",
        "openai/widgetAccessible": true,
      });
    });

    it("should map 'model' visibility to public without widget access", () => {
      const toolDef = { ...sampleToolDef, visibility: "model" as const };
      const result = adapter.buildToolMeta(toolDef, "test-server");
      expect(result._meta).toMatchObject({
        "openai/visibility": "public",
        "openai/widgetAccessible": false,
      });
    });

    it("should map 'app' visibility to private with widget access", () => {
      const toolDef = { ...sampleToolDef, visibility: "app" as const };
      const result = adapter.buildToolMeta(toolDef, "test-server");
      expect(result._meta).toMatchObject({
        "openai/visibility": "private",
        "openai/widgetAccessible": true,
      });
    });

    it("should map 'both' visibility to public with widget access", () => {
      const toolDef = { ...sampleToolDef, visibility: "both" as const };
      const result = adapter.buildToolMeta(toolDef, "test-server");
      expect(result._meta).toMatchObject({
        "openai/visibility": "public",
        "openai/widgetAccessible": true,
      });
    });

    it("should allow explicit widgetAccessible to override visibility", () => {
      const toolDef = {
        ...sampleToolDef,
        visibility: "model" as const,
        widgetAccessible: true,
      };
      const result = adapter.buildToolMeta(toolDef, "test-server");
      expect(result._meta).toMatchObject({
        "openai/visibility": "public",
        "openai/widgetAccessible": true,
      });
    });

    it("should include outputTemplate when ui is specified", () => {
      const toolDef = { ...sampleToolDef, ui: "greeting-widget" };
      const uiUri = "ui://test-server/greeting-widget?v=abc12345";
      const result = adapter.buildToolMeta(toolDef, "test-server", uiUri);
      expect(result._meta).toMatchObject({
        "openai/outputTemplate": uiUri,
      });
    });

    it("should include invoking message when specified", () => {
      const toolDef = { ...sampleToolDef, invokingMessage: "Processing..." };
      const result = adapter.buildToolMeta(toolDef, "test-server");
      expect(result._meta).toMatchObject({
        "openai/toolInvocation/invoking": "Processing...",
      });
    });

    it("should include invoked message when specified", () => {
      const toolDef = { ...sampleToolDef, invokedMessage: "Done!" };
      const result = adapter.buildToolMeta(toolDef, "test-server");
      expect(result._meta).toMatchObject({
        "openai/toolInvocation/invoked": "Done!",
      });
    });

    it("should include both invoking and invoked messages", () => {
      const toolDef = {
        ...sampleToolDef,
        invokingMessage: "Processing...",
        invokedMessage: "Done!",
      };
      const result = adapter.buildToolMeta(toolDef, "test-server");
      expect(result._meta).toMatchObject({
        "openai/toolInvocation/invoking": "Processing...",
        "openai/toolInvocation/invoked": "Done!",
      });
    });

    it("should not return annotations when not specified", () => {
      const result = adapter.buildToolMeta(sampleToolDef, "test-server");
      expect(result.annotations).toBeUndefined();
    });

    it("should include readOnlyHint annotation", () => {
      const toolDef = { ...sampleToolDef, annotations: { readOnlyHint: true } };
      const result = adapter.buildToolMeta(toolDef, "test-server");
      expect(result.annotations).toEqual({ readOnlyHint: true });
    });

    it("should include destructiveHint annotation", () => {
      const toolDef = { ...sampleToolDef, annotations: { destructiveHint: true } };
      const result = adapter.buildToolMeta(toolDef, "test-server");
      expect(result.annotations).toEqual({ destructiveHint: true });
    });

    it("should include all annotation types together", () => {
      const toolDef = {
        ...sampleToolDef,
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          openWorldHint: true,
          idempotentHint: false,
        },
      };
      const result = adapter.buildToolMeta(toolDef, "test-server");
      expect(result.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
        idempotentHint: false,
      });
    });

    it("should include fileParams when specified", () => {
      const toolDef = { ...sampleToolDef, fileParams: ["imageFile", "documentFile"] };
      const result = adapter.buildToolMeta(toolDef, "test-server");
      expect(result._meta).toMatchObject({
        "openai/fileParams": ["imageFile", "documentFile"],
      });
    });

    it("should not include fileParams when empty array", () => {
      const toolDef = { ...sampleToolDef, fileParams: [] };
      const result = adapter.buildToolMeta(toolDef, "test-server");
      expect(result._meta).not.toHaveProperty("openai/fileParams");
    });

    it("should not include fileParams when not specified", () => {
      const result = adapter.buildToolMeta(sampleToolDef, "test-server");
      expect(result._meta).not.toHaveProperty("openai/fileParams");
    });
  });

  describe("buildUIResourceMeta", () => {
    it("should return correct MIME type for OpenAI", () => {
      const result = adapter.buildUIResourceMeta(sampleUIDef);
      expect(result.mimeType).toBe("text/html+skybridge");
    });

    it("should return undefined _meta when no options specified", () => {
      const result = adapter.buildUIResourceMeta(sampleUIDef);
      expect(result._meta).toBeUndefined();
    });

    it("should include CSP with openai/widgetCSP key and snake_case", () => {
      const uiDef: UIDef = {
        ...sampleUIDef,
        csp: {
          connectDomains: ["https://api.example.com"],
          resourceDomains: ["https://cdn.example.com"],
          redirectDomains: ["https://docs.example.com"],
          frameDomains: ["https://embed.example.com"],
        },
      };
      const result = adapter.buildUIResourceMeta(uiDef);
      expect(result._meta).toEqual({
        "openai/widgetCSP": {
          connect_domains: ["https://api.example.com"],
          resource_domains: ["https://cdn.example.com"],
          redirect_domains: ["https://docs.example.com"],
          frame_domains: ["https://embed.example.com"],
        },
      });
    });

    it("should include prefersBorder with openai/ prefix", () => {
      const uiDef: UIDef = { ...sampleUIDef, prefersBorder: true };
      const result = adapter.buildUIResourceMeta(uiDef);
      expect(result._meta).toEqual({
        "openai/widgetPrefersBorder": true,
      });
    });

    it("should include domain with openai/ prefix", () => {
      const uiDef: UIDef = { ...sampleUIDef, domain: "https://example.com" };
      const result = adapter.buildUIResourceMeta(uiDef);
      expect(result._meta).toEqual({
        "openai/widgetDomain": "https://example.com",
      });
    });

    it("should combine multiple UI options with openai/ prefixes", () => {
      const uiDef: UIDef = {
        ...sampleUIDef,
        prefersBorder: false,
        domain: "https://example.com",
        csp: {
          connectDomains: ["https://api.example.com"],
        },
      };
      const result = adapter.buildUIResourceMeta(uiDef);
      expect(result._meta).toEqual({
        "openai/widgetCSP": {
          connect_domains: ["https://api.example.com"],
        },
        "openai/widgetPrefersBorder": false,
        "openai/widgetDomain": "https://example.com",
      });
    });

    it("should include widgetDescription when specified", () => {
      const uiDef: UIDef = {
        ...sampleUIDef,
        widgetDescription: "Interactive task board for managing project workflows",
      };
      const result = adapter.buildUIResourceMeta(uiDef);
      expect(result._meta).toEqual({
        "openai/widgetDescription": "Interactive task board for managing project workflows",
      });
    });

    it("should not include widgetDescription when not specified", () => {
      const result = adapter.buildUIResourceMeta(sampleUIDef);
      expect(result._meta).toBeUndefined();
    });

    it("should combine widgetDescription with other options", () => {
      const uiDef: UIDef = {
        ...sampleUIDef,
        widgetDescription: "A greeting widget",
        prefersBorder: true,
      };
      const result = adapter.buildUIResourceMeta(uiDef);
      expect(result._meta).toEqual({
        "openai/widgetDescription": "A greeting widget",
        "openai/widgetPrefersBorder": true,
      });
    });
  });
});
