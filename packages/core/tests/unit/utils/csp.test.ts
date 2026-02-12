import { describe, it, expect } from "vitest";
import {
  generateMcpCSPMetadata,
  generateOpenAICSPMetadata,
  generateMcpUIMetadata,
  generateOpenAIUIMetadata,
} from "../../../src/utils/csp";
import type { CSPConfig, UIDef } from "../../../src/types/ui";

describe("generateMcpCSPMetadata", () => {
  it("returns empty object for empty config", () => {
    expect(generateMcpCSPMetadata({})).toEqual({});
  });

  it("includes connectDomains when present", () => {
    const csp: CSPConfig = { connectDomains: ["https://api.example.com"] };
    expect(generateMcpCSPMetadata(csp)).toEqual({
      connectDomains: ["https://api.example.com"],
    });
  });

  it("includes resourceDomains when present", () => {
    const csp: CSPConfig = { resourceDomains: ["https://cdn.example.com"] };
    expect(generateMcpCSPMetadata(csp)).toEqual({
      resourceDomains: ["https://cdn.example.com"],
    });
  });

  it("ignores ChatGPT-only fields (redirectDomains, frameDomains)", () => {
    const csp: CSPConfig = {
      connectDomains: ["https://api.example.com"],
      redirectDomains: ["https://docs.example.com"],
      frameDomains: ["https://embed.example.com"],
    };
    expect(generateMcpCSPMetadata(csp)).toEqual({
      connectDomains: ["https://api.example.com"],
    });
  });

  it("omits empty arrays", () => {
    const csp: CSPConfig = { connectDomains: [], resourceDomains: [] };
    expect(generateMcpCSPMetadata(csp)).toEqual({});
  });
});

describe("generateOpenAICSPMetadata", () => {
  it("returns empty object for empty config", () => {
    expect(generateOpenAICSPMetadata({})).toEqual({});
  });

  it("maps all four CSP fields to snake_case", () => {
    const csp: CSPConfig = {
      connectDomains: ["https://api.example.com"],
      resourceDomains: ["https://cdn.example.com"],
      redirectDomains: ["https://docs.example.com"],
      frameDomains: ["https://embed.example.com"],
    };
    expect(generateOpenAICSPMetadata(csp)).toEqual({
      connect_domains: ["https://api.example.com"],
      resource_domains: ["https://cdn.example.com"],
      redirect_domains: ["https://docs.example.com"],
      frame_domains: ["https://embed.example.com"],
    });
  });

  it("omits empty arrays", () => {
    const csp: CSPConfig = { connectDomains: [], frameDomains: [] };
    expect(generateOpenAICSPMetadata(csp)).toEqual({});
  });
});

describe("generateMcpUIMetadata", () => {
  it("generates minimal metadata with key as name fallback", () => {
    const uiDef: UIDef = { html: "<div>Hello</div>" };
    const result = generateMcpUIMetadata("widget", uiDef);
    expect(result).toEqual({
      name: "widget",
      html: "<div>Hello</div>",
    });
  });

  it("uses explicit name over key", () => {
    const uiDef: UIDef = { html: "<div/>", name: "My Widget" };
    expect(generateMcpUIMetadata("widget", uiDef).name).toBe("My Widget");
  });

  it("includes description when provided", () => {
    const uiDef: UIDef = { html: "<div/>", description: "A widget" };
    expect(generateMcpUIMetadata("w", uiDef).description).toBe("A widget");
  });

  it("includes CSP when non-empty", () => {
    const uiDef: UIDef = {
      html: "<div/>",
      csp: { connectDomains: ["https://api.example.com"] },
    };
    const result = generateMcpUIMetadata("w", uiDef);
    expect(result.csp).toEqual({ connectDomains: ["https://api.example.com"] });
  });

  it("omits CSP when all arrays are empty", () => {
    const uiDef: UIDef = { html: "<div/>", csp: { connectDomains: [] } };
    const result = generateMcpUIMetadata("w", uiDef);
    expect(result.csp).toBeUndefined();
  });

  it("includes prefersBorder when set", () => {
    const uiDef: UIDef = { html: "<div/>", prefersBorder: true };
    expect(generateMcpUIMetadata("w", uiDef).prefersBorder).toBe(true);
  });
});

describe("generateOpenAIUIMetadata", () => {
  it("generates minimal metadata", () => {
    const uiDef: UIDef = { html: "<div>Hello</div>" };
    const result = generateOpenAIUIMetadata("widget", uiDef);
    expect(result).toEqual({
      name: "widget",
      html: "<div>Hello</div>",
    });
  });

  it("includes openai/widgetCSP with snake_case fields", () => {
    const uiDef: UIDef = {
      html: "<div/>",
      csp: {
        connectDomains: ["https://api.example.com"],
        frameDomains: ["https://embed.example.com"],
      },
    };
    const result = generateOpenAIUIMetadata("w", uiDef);
    expect(result["openai/widgetCSP"]).toEqual({
      connect_domains: ["https://api.example.com"],
      frame_domains: ["https://embed.example.com"],
    });
  });

  it("includes domain when provided", () => {
    const uiDef: UIDef = { html: "<div/>", domain: "https://app.example.com" };
    expect(generateOpenAIUIMetadata("w", uiDef).domain).toBe("https://app.example.com");
  });

  it("omits widgetCSP when all arrays are empty", () => {
    const uiDef: UIDef = { html: "<div/>", csp: { resourceDomains: [] } };
    const result = generateOpenAIUIMetadata("w", uiDef);
    expect(result["openai/widgetCSP"]).toBeUndefined();
  });
});
