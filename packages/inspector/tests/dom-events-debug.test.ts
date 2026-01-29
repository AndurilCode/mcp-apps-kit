/**
 * Debug test for DOM event recording
 *
 * This test verifies that:
 * 1. The inspectorUrl is correctly set in the generated host page
 * 2. DOM event listeners are attached
 * 3. Events are recorded when interactions happen
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { WidgetServer } from "../src/widget-server";
import { generateMcpHostPage, generateOpenAIHostPage } from "../src/widget-server-templates";

describe("DOM Event Recording Debug", () => {
  describe("Template Generation", () => {
    it("should include inspectorUrl in MCP host page when provided", () => {
      const session = {
        id: "test-session-123",
        html: "<html><body>Test</body></html>",
        toolResult: { test: "result" },
        toolName: "test_tool",
        protocol: "mcp" as const,
        createdAt: Date.now(),
        inspectorUrl: "http://localhost:6274",
        isDualMode: false,
      };

      const html = generateMcpHostPage({
        session,
        widgetUrl: "http://localhost:3000/widget/test-session-123",
        toolResultJson: JSON.stringify(session.toolResult),
        toolNameJson: JSON.stringify(session.toolName),
        theme: "light",
        displayMode: "inline",
        locale: "en-US",
        timeZone: "UTC",
        platform: "desktop",
        externalHostContextJson: "{}",
      });

      // Check that inspectorUrl is set correctly (not null)
      expect(html).toContain('const inspectorUrl = "http://localhost:6274"');
      expect(html).not.toContain("const inspectorUrl = null");

      // Check that recordEvent function exists
      expect(html).toContain("function recordEvent(type, payload, source)");

      // Check that DOM event listeners are attached
      expect(html).toContain("addEventListener('click'");
      expect(html).toContain("recordEvent('dom-click'");
    });

    it("should set inspectorUrl to null when not provided", () => {
      const session = {
        id: "test-session-123",
        html: "<html><body>Test</body></html>",
        toolResult: { test: "result" },
        toolName: "test_tool",
        protocol: "mcp" as const,
        createdAt: Date.now(),
        // inspectorUrl not provided
        isDualMode: false,
      };

      const html = generateMcpHostPage({
        session,
        widgetUrl: "http://localhost:3000/widget/test-session-123",
        toolResultJson: JSON.stringify(session.toolResult),
        toolNameJson: JSON.stringify(session.toolName),
        theme: "light",
        displayMode: "inline",
        locale: "en-US",
        timeZone: "UTC",
        platform: "desktop",
        externalHostContextJson: "{}",
      });

      // Check that inspectorUrl is null
      expect(html).toContain("const inspectorUrl = null");
    });

    it("should include inspectorUrl in OpenAI host page when provided", () => {
      const session = {
        id: "test-session-456",
        html: "<html><body>Test</body></html>",
        toolResult: { test: "result" },
        toolName: "test_tool",
        protocol: "openai" as const,
        createdAt: Date.now(),
        inspectorUrl: "http://localhost:6274",
        isDualMode: false,
      };

      const html = generateOpenAIHostPage({
        session,
        widgetUrl: "http://localhost:3000/widget/test-session-456",
      });

      // Check that inspectorUrl is set correctly (not null)
      expect(html).toContain('const inspectorUrl = "http://localhost:6274"');
      expect(html).not.toContain("const inspectorUrl = null");

      // Check that recordEvent function exists
      expect(html).toContain("function recordEvent(type, payload, source)");

      // Check that DOM event listeners are attached
      expect(html).toContain("addEventListener('click'");
      expect(html).toContain("recordEvent('dom-click'");
    });
  });

  describe("WidgetServer Session Creation", () => {
    let server: WidgetServer;

    beforeAll(async () => {
      server = new WidgetServer({ debug: true });
      await server.start();
    });

    afterAll(async () => {
      await server.stop();
    });

    it("should store inspectorUrl in session when provided", async () => {
      const { sessionId, hostUrl } = server.createSession(
        "<html><body>Test</body></html>",
        { test: "result" },
        "test_tool",
        {}, // toolArgs
        "mcp",
        undefined, // environmentState
        undefined, // externalHostContext
        "http://localhost:6274", // inspectorUrl
        false // isDualMode
      );

      // Fetch the host page
      const response = await fetch(hostUrl);
      const html = await response.text();

      // Verify inspectorUrl is in the generated page
      expect(html).toContain('const inspectorUrl = "http://localhost:6274"');
      expect(html).not.toContain("const inspectorUrl = null");

      // Clean up
      server.deleteSession(sessionId);
    });

    it("should set inspectorUrl to null when not provided", async () => {
      const { sessionId, hostUrl } = server.createSession(
        "<html><body>Test</body></html>",
        { test: "result" },
        "test_tool",
        {}, // toolArgs
        "mcp",
        undefined, // environmentState
        undefined, // externalHostContext
        undefined, // inspectorUrl not provided
        false // isDualMode
      );

      // Fetch the host page
      const response = await fetch(hostUrl);
      const html = await response.text();

      // Verify inspectorUrl is null
      expect(html).toContain("const inspectorUrl = null");

      // Clean up
      server.deleteSession(sessionId);
    });
  });
});
