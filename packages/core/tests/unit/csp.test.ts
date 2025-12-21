/**
 * Unit tests for CSP metadata generation
 *
 * Tests CSP configuration mapping for both MCP and OpenAI protocols.
 */

import { describe, it, expect } from "vitest";
import {
  generateMcpCSPMetadata,
  generateOpenAICSPMetadata,
  generateMcpUIMetadata,
  generateOpenAIUIMetadata,
} from "../../src/utils/csp";
import type { CSPConfig, UIDef } from "../../src/types/ui";

describe("CSP Metadata Generation", () => {
  describe("generateMcpCSPMetadata", () => {
    it("should generate MCP CSP format with connectDomains", () => {
      const csp: CSPConfig = {
        connectDomains: ["https://api.example.com"],
      };

      const result = generateMcpCSPMetadata(csp);

      expect(result).toEqual({
        connectDomains: ["https://api.example.com"],
      });
    });

    it("should generate MCP CSP format with resourceDomains", () => {
      const csp: CSPConfig = {
        resourceDomains: ["https://cdn.example.com"],
      };

      const result = generateMcpCSPMetadata(csp);

      expect(result).toEqual({
        resourceDomains: ["https://cdn.example.com"],
      });
    });

    it("should include both connect and resource domains", () => {
      const csp: CSPConfig = {
        connectDomains: ["https://api.example.com"],
        resourceDomains: ["https://cdn.example.com"],
      };

      const result = generateMcpCSPMetadata(csp);

      expect(result).toEqual({
        connectDomains: ["https://api.example.com"],
        resourceDomains: ["https://cdn.example.com"],
      });
    });

    it("should ignore ChatGPT-only fields (redirectDomains, frameDomains)", () => {
      const csp: CSPConfig = {
        connectDomains: ["https://api.example.com"],
        redirectDomains: ["https://docs.example.com"],
        frameDomains: ["https://embed.example.com"],
      };

      const result = generateMcpCSPMetadata(csp);

      expect(result).toEqual({
        connectDomains: ["https://api.example.com"],
      });
      expect(result).not.toHaveProperty("redirectDomains");
      expect(result).not.toHaveProperty("frameDomains");
    });

    it("should return empty object for empty CSP config", () => {
      const csp: CSPConfig = {};

      const result = generateMcpCSPMetadata(csp);

      expect(result).toEqual({});
    });
  });

  describe("generateOpenAICSPMetadata", () => {
    it("should generate OpenAI CSP format with connect_domains", () => {
      const csp: CSPConfig = {
        connectDomains: ["https://api.example.com"],
      };

      const result = generateOpenAICSPMetadata(csp);

      expect(result).toEqual({
        connect_domains: ["https://api.example.com"],
      });
    });

    it("should generate OpenAI CSP format with resource_domains", () => {
      const csp: CSPConfig = {
        resourceDomains: ["https://cdn.example.com"],
      };

      const result = generateOpenAICSPMetadata(csp);

      expect(result).toEqual({
        resource_domains: ["https://cdn.example.com"],
      });
    });

    it("should include redirect_domains for ChatGPT", () => {
      const csp: CSPConfig = {
        redirectDomains: ["https://docs.example.com"],
      };

      const result = generateOpenAICSPMetadata(csp);

      expect(result).toEqual({
        redirect_domains: ["https://docs.example.com"],
      });
    });

    it("should include frame_domains for ChatGPT", () => {
      const csp: CSPConfig = {
        frameDomains: ["https://embed.example.com"],
      };

      const result = generateOpenAICSPMetadata(csp);

      expect(result).toEqual({
        frame_domains: ["https://embed.example.com"],
      });
    });

    it("should include all CSP fields for OpenAI", () => {
      const csp: CSPConfig = {
        connectDomains: ["https://api.example.com"],
        resourceDomains: ["https://cdn.example.com"],
        redirectDomains: ["https://docs.example.com"],
        frameDomains: ["https://embed.example.com"],
      };

      const result = generateOpenAICSPMetadata(csp);

      expect(result).toEqual({
        connect_domains: ["https://api.example.com"],
        resource_domains: ["https://cdn.example.com"],
        redirect_domains: ["https://docs.example.com"],
        frame_domains: ["https://embed.example.com"],
      });
    });

    it("should return empty object for empty CSP config", () => {
      const csp: CSPConfig = {};

      const result = generateOpenAICSPMetadata(csp);

      expect(result).toEqual({});
    });
  });

  describe("generateMcpUIMetadata", () => {
    it("should generate MCP UI metadata with html content", () => {
      const uiDef: UIDef = {
        html: "<div>Hello World</div>",
      };

      const result = generateMcpUIMetadata("widget", uiDef);

      expect(result).toEqual({
        name: "widget",
        html: "<div>Hello World</div>",
      });
    });

    it("should use provided name over key", () => {
      const uiDef: UIDef = {
        name: "My Widget",
        html: "<div>Hello</div>",
      };

      const result = generateMcpUIMetadata("widget-key", uiDef);

      expect(result.name).toBe("My Widget");
    });

    it("should include description if provided", () => {
      const uiDef: UIDef = {
        html: "<div>Hello</div>",
        description: "A simple widget",
      };

      const result = generateMcpUIMetadata("widget", uiDef);

      expect(result.description).toBe("A simple widget");
    });

    it("should include CSP metadata", () => {
      const uiDef: UIDef = {
        html: "<div>Hello</div>",
        csp: {
          connectDomains: ["https://api.example.com"],
          resourceDomains: ["https://cdn.example.com"],
        },
      };

      const result = generateMcpUIMetadata("widget", uiDef);

      expect(result.csp).toEqual({
        connectDomains: ["https://api.example.com"],
        resourceDomains: ["https://cdn.example.com"],
      });
    });

    it("should include prefersBorder", () => {
      const uiDef: UIDef = {
        html: "<div>Hello</div>",
        prefersBorder: true,
      };

      const result = generateMcpUIMetadata("widget", uiDef);

      expect(result.prefersBorder).toBe(true);
    });

    it("should not include empty CSP", () => {
      const uiDef: UIDef = {
        html: "<div>Hello</div>",
        csp: {},
      };

      const result = generateMcpUIMetadata("widget", uiDef);

      expect(result).not.toHaveProperty("csp");
    });
  });

  describe("generateOpenAIUIMetadata", () => {
    it("should generate OpenAI UI metadata with html content", () => {
      const uiDef: UIDef = {
        html: "<div>Hello World</div>",
      };

      const result = generateOpenAIUIMetadata("widget", uiDef);

      expect(result).toEqual({
        name: "widget",
        html: "<div>Hello World</div>",
      });
    });

    it("should include OpenAI CSP format", () => {
      const uiDef: UIDef = {
        html: "<div>Hello</div>",
        csp: {
          connectDomains: ["https://api.example.com"],
          redirectDomains: ["https://docs.example.com"],
        },
      };

      const result = generateOpenAIUIMetadata("widget", uiDef);

      expect(result["openai/widgetCSP"]).toEqual({
        connect_domains: ["https://api.example.com"],
        redirect_domains: ["https://docs.example.com"],
      });
    });

    it("should include domain for ChatGPT widget isolation", () => {
      const uiDef: UIDef = {
        html: "<div>Hello</div>",
        domain: "widget.example.com",
      };

      const result = generateOpenAIUIMetadata("widget", uiDef);

      expect(result.domain).toBe("widget.example.com");
    });

    it("should include prefersBorder", () => {
      const uiDef: UIDef = {
        html: "<div>Hello</div>",
        prefersBorder: true,
      };

      const result = generateOpenAIUIMetadata("widget", uiDef);

      expect(result.prefersBorder).toBe(true);
    });

    it("should not include empty CSP", () => {
      const uiDef: UIDef = {
        html: "<div>Hello</div>",
        csp: {},
      };

      const result = generateOpenAIUIMetadata("widget", uiDef);

      expect(result).not.toHaveProperty("openai/widgetCSP");
    });
  });
});
