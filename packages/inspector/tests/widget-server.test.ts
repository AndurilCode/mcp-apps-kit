/**
 * Widget Server Tests
 */

import { describe, it, expect, afterEach } from "vitest";
import { WidgetServer } from "../src/widget-server";

describe("WidgetServer", () => {
  let server: WidgetServer | null = null;

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
  });

  describe("start/stop", () => {
    it("should start on ephemeral port", async () => {
      server = new WidgetServer();
      const port = await server.start();
      expect(port).toBeGreaterThan(0);
      expect(server.getPort()).toBe(port);
    });

    it("should return same port on repeated start calls", async () => {
      server = new WidgetServer();
      const port1 = await server.start();
      const port2 = await server.start();
      expect(port1).toBe(port2);
    });

    it("should stop cleanly", async () => {
      server = new WidgetServer();
      await server.start();
      await server.stop();
      expect(server.getPort()).toBe(0);
    });
  });

  describe("session management", () => {
    it("should create MCP sessions", async () => {
      server = new WidgetServer();
      await server.start();

      const result = server.createSession(
        "<html><body>Test Widget</body></html>",
        { data: "test" },
        "test_tool",
        {},
        "mcp"
      );

      expect(result.sessionId).toBeTruthy();
      expect(result.hostUrl).toContain("/host/");
      expect(result.widgetUrl).toContain("/widget/");
    });

    it("should create OpenAI sessions", async () => {
      server = new WidgetServer();
      await server.start();

      const result = server.createSession(
        "<html><body>Test Widget</body></html>",
        { data: "test" },
        "test_tool",
        {},
        "openai"
      );

      expect(result.sessionId).toBeTruthy();
      expect(result.hostUrl).toContain("/host/");
      expect(result.widgetUrl).toContain("/widget/");
    });

    it("should delete sessions", async () => {
      server = new WidgetServer();
      await server.start();

      const result = server.createSession(
        "<html><body>Test</body></html>",
        {},
        "test_tool",
        {},
        "mcp"
      );

      // Should not throw
      server.deleteSession(result.sessionId);
      // Deleting again should be a no-op
      server.deleteSession(result.sessionId);
    });
  });

  describe("HTTP endpoints", () => {
    it("should serve widget HTML at /widget/:id", async () => {
      server = new WidgetServer();
      await server.start();

      const widgetHtml = "<html><body>Widget Content</body></html>";
      const result = server.createSession(widgetHtml, {}, "test_tool", {}, "mcp");

      const response = await fetch(result.widgetUrl);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");

      const body = await response.text();
      expect(body).toBe(widgetHtml);
    });

    it("should serve MCP host page at /host/:id", async () => {
      server = new WidgetServer();
      await server.start();

      const result = server.createSession(
        "<html><body>Widget</body></html>",
        { weather: "sunny" },
        "get_weather",
        {},
        "mcp"
      );

      const response = await fetch(result.hostUrl);
      expect(response.status).toBe(200);

      const body = await response.text();
      expect(body).toContain("MCP Widget Host");
      expect(body).toContain("iframe");
      expect(body).toContain(result.widgetUrl);
      expect(body).toContain("sunny");
      expect(body).toContain("get_weather");
    });

    it("should serve OpenAI host page at /host/:id", async () => {
      server = new WidgetServer();
      await server.start();

      const result = server.createSession(
        "<html><body>Widget</body></html>",
        { temperature: 72 },
        "get_weather",
        {},
        "openai"
      );

      const response = await fetch(result.hostUrl);
      expect(response.status).toBe(200);

      const body = await response.text();
      expect(body).toContain("OpenAI Widget Host");
      expect(body).toContain("iframe");
      expect(body).toContain(result.widgetUrl);
      // The tool result is now injected into the widget HTML, not the host page
      expect(body).toContain("openai:callTool"); // Check for runtime message handling
    });

    it("should inject OpenAI runtime into widget HTML", async () => {
      server = new WidgetServer();
      await server.start();

      const result = server.createSession(
        "<html><head></head><body>Widget</body></html>",
        { temperature: 72 },
        "get_weather",
        {},
        "openai"
      );

      const response = await fetch(result.widgetUrl);
      expect(response.status).toBe(200);

      const body = await response.text();
      // Check that runtime bootstrap script is injected
      expect(body).toContain("openai-runtime-bootstrap");
      expect(body).toContain("window.openai");
      expect(body).toContain("72"); // Tool result should be in the widget HTML
      expect(body).toContain("get_weather"); // Tool name should be in the widget HTML
    });

    it("should return 404 for unknown session", async () => {
      server = new WidgetServer();
      await server.start();
      const port = server.getPort();

      const response = await fetch(`http://127.0.0.1:${port}/widget/unknown-id`);
      expect(response.status).toBe(404);
    });

    it("should return 404 for unknown routes", async () => {
      server = new WidgetServer();
      await server.start();
      const port = server.getPort();

      const response = await fetch(`http://127.0.0.1:${port}/unknown`);
      expect(response.status).toBe(404);
    });
  });

  describe("options", () => {
    it("should accept custom session TTL", async () => {
      server = new WidgetServer({ sessionTTL: 1000 });
      await server.start();
      expect(server.getPort()).toBeGreaterThan(0);
    });

    it("should accept debug option", async () => {
      server = new WidgetServer({ debug: true });
      await server.start();
      expect(server.getPort()).toBeGreaterThan(0);
    });
  });

  describe("new features - production parity", () => {
    describe("auto-resize with ResizeObserver", () => {
      it("should inject ResizeObserver into widget runtime", async () => {
        server = new WidgetServer();
        await server.start();

        const result = server.createSession(
          "<html><head></head><body>Widget</body></html>",
          { temperature: 72 },
          "get_weather",
          {},
          "openai"
        );

        const response = await fetch(result.widgetUrl);
        const body = await response.text();

        expect(body).toContain("ResizeObserver");
        expect(body).toContain("notifyIntrinsicHeight");
      });
    });

    describe("navigation history tracking", () => {
      it("should inject notifyNavigation API", async () => {
        server = new WidgetServer();
        await server.start();

        const result = server.createSession(
          "<html><head></head><body>Widget</body></html>",
          {},
          "test_tool",
          {},
          "openai"
        );

        const response = await fetch(result.widgetUrl);
        const body = await response.text();

        expect(body).toContain("notifyNavigation");
        expect(body).toContain("history.pushState");
        expect(body).toContain("history.replaceState");
        expect(body).toContain("popstate");
      });

      it("should track navigation in host page", async () => {
        server = new WidgetServer();
        await server.start();

        const result = server.createSession(
          "<html><body>Widget</body></html>",
          {},
          "test_tool",
          {},
          "openai"
        );

        const response = await fetch(result.hostUrl);
        const body = await response.text();

        expect(body).toContain("openai:navigation");
        expect(body).toContain("window.__hostState.navigations");
      });
    });

    describe("enhanced error reporting", () => {
      it("should inject CSP violation listener", async () => {
        server = new WidgetServer();
        await server.start();

        const result = server.createSession(
          "<html><head></head><body>Widget</body></html>",
          {},
          "test_tool",
          {},
          "openai"
        );

        const response = await fetch(result.widgetUrl);
        const body = await response.text();

        expect(body).toContain("securitypolicyviolation");
        expect(body).toContain("openai:cspViolation");
      });

      it("should inject error listeners", async () => {
        server = new WidgetServer();
        await server.start();

        const result = server.createSession(
          "<html><head></head><body>Widget</body></html>",
          {},
          "test_tool",
          {},
          "openai"
        );

        const response = await fetch(result.widgetUrl);
        const body = await response.text();

        expect(body).toContain("addEventListener('error'");
        expect(body).toContain("addEventListener('unhandledrejection'");
        expect(body).toContain("openai:error");
      });

      it("should track errors in host page", async () => {
        server = new WidgetServer();
        await server.start();

        const result = server.createSession(
          "<html><body>Widget</body></html>",
          {},
          "test_tool",
          {},
          "openai"
        );

        const response = await fetch(result.hostUrl);
        const body = await response.text();

        expect(body).toContain("openai:cspViolation");
        expect(body).toContain("openai:error");
        expect(body).toContain("window.__hostState.errors");
        expect(body).toContain("window.__hostState.cspViolations");
      });
    });

    describe("modal support", () => {
      it("should inject requestModal API", async () => {
        server = new WidgetServer();
        await server.start();

        const result = server.createSession(
          "<html><head></head><body>Widget</body></html>",
          {},
          "test_tool",
          {},
          "openai"
        );

        const response = await fetch(result.widgetUrl);
        const body = await response.text();

        expect(body).toContain("requestModal");
        expect(body).toContain("_modalId");
        expect(body).toContain("openai:requestModal");
        expect(body).toContain("openai:modal:response");
      });

      it("should handle modal requests in host page", async () => {
        server = new WidgetServer();
        await server.start();

        const result = server.createSession(
          "<html><body>Widget</body></html>",
          {},
          "test_tool",
          {},
          "openai"
        );

        const response = await fetch(result.hostUrl);
        const body = await response.text();

        expect(body).toContain("openai:requestModal");
        expect(body).toContain("openai:modal:response");
        expect(body).toContain("inspector_mock");
      });
    });

    describe("display mode enhancements", () => {
      it("should inject setOpenInAppUrl API", async () => {
        server = new WidgetServer();
        await server.start();

        const result = server.createSession(
          "<html><head></head><body>Widget</body></html>",
          {},
          "test_tool",
          {},
          "openai"
        );

        const response = await fetch(result.widgetUrl);
        const body = await response.text();

        expect(body).toContain("setOpenInAppUrl");
        expect(body).toContain("_openInAppUrl");
        expect(body).toContain("openai:setOpenInAppUrl");
      });

      it("should enhance requestDisplayMode for all modes", async () => {
        server = new WidgetServer();
        await server.start();

        const result = server.createSession(
          "<html><head></head><body>Widget</body></html>",
          {},
          "test_tool",
          {},
          "openai"
        );

        const response = await fetch(result.widgetUrl);
        const body = await response.text();

        expect(body).toContain("requestDisplayMode");
        expect(body).toContain("inline");
        expect(body).toContain("fullscreen");
        expect(body).toContain("pip");
      });

      it("should track setOpenInAppUrl in host page", async () => {
        server = new WidgetServer();
        await server.start();

        const result = server.createSession(
          "<html><body>Widget</body></html>",
          {},
          "test_tool",
          {},
          "openai"
        );

        const response = await fetch(result.hostUrl);
        const body = await response.text();

        expect(body).toContain("openai:setOpenInAppUrl");
        expect(body).toContain("window.__hostState.openInAppUrl");
      });
    });

    describe("user/session metadata", () => {
      it("should inject session metadata into runtime", async () => {
        server = new WidgetServer();
        await server.start();

        const result = server.createSession(
          "<html><head></head><body>Widget</body></html>",
          {},
          "test_tool",
          {},
          "openai"
        );

        const response = await fetch(result.widgetUrl);
        const body = await response.text();

        expect(body).toContain("widgetSessionId");
        expect(body).toContain("subjectId");
        expect(body).toContain("sessionId");
        expect(body).toContain("userLocation");
        expect(body).toContain("mock-subject-");
        expect(body).toContain("mock-session-");
      });

      it("should include locale in metadata", async () => {
        server = new WidgetServer();
        await server.start();

        const result = server.createSession(
          "<html><head></head><body>Widget</body></html>",
          {},
          "test_tool",
          {},
          "openai"
        );

        const response = await fetch(result.widgetUrl);
        const body = await response.text();

        expect(body).toContain("locale");
        expect(body).toContain("en-US");
      });

      it("should include userLocation with default values", async () => {
        server = new WidgetServer();
        await server.start();

        const result = server.createSession(
          "<html><head></head><body>Widget</body></html>",
          {},
          "test_tool",
          {},
          "openai"
        );

        const response = await fetch(result.widgetUrl);
        const body = await response.text();

        expect(body).toContain("userLocation");
        expect(body).toContain("Unknown");
        expect(body).toContain("US");
        expect(body).toContain("UTC");
      });
    });

    describe("storage event sync", () => {
      it("should inject storage event listeners", async () => {
        server = new WidgetServer();
        await server.start();

        const result = server.createSession(
          "<html><head></head><body>Widget</body></html>",
          {},
          "test_tool",
          {},
          "openai"
        );

        const response = await fetch(result.widgetUrl);
        const body = await response.text();

        expect(body).toContain("addEventListener('storage'");
        expect(body).toContain("openai:storageChange");
        expect(body).toContain("openai:syncStorage");
      });

      it("should track storage changes in host page", async () => {
        server = new WidgetServer();
        await server.start();

        const result = server.createSession(
          "<html><body>Widget</body></html>",
          {},
          "test_tool",
          {},
          "openai"
        );

        const response = await fetch(result.hostUrl);
        const body = await response.text();

        expect(body).toContain("openai:storageChange");
        expect(body).toContain("window.__hostState.storageChanges");
      });
    });

    describe("enhanced file APIs", () => {
      it("should inject enhanced uploadFile implementation", async () => {
        server = new WidgetServer();
        await server.start();

        const result = server.createSession(
          "<html><head></head><body>Widget</body></html>",
          {},
          "test_tool",
          {},
          "openai"
        );

        const response = await fetch(result.widgetUrl);
        const body = await response.text();

        expect(body).toContain("uploadFile");
        expect(body).toContain("_uploadedFiles");
        expect(body).toContain("FileReader");
        expect(body).toContain("readAsDataURL");
      });

      it("should inject enhanced getFileDownloadUrl implementation", async () => {
        server = new WidgetServer();
        await server.start();

        const result = server.createSession(
          "<html><head></head><body>Widget</body></html>",
          {},
          "test_tool",
          {},
          "openai"
        );

        const response = await fetch(result.widgetUrl);
        const body = await response.text();

        expect(body).toContain("getFileDownloadUrl");
        expect(body).toContain("_uploadedFiles.get");
        expect(body).toContain("dataUrl");
      });
    });
  });
});
