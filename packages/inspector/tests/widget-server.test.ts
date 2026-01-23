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
        "openai"
      );

      expect(result.sessionId).toBeTruthy();
      expect(result.hostUrl).toContain("/host/");
      expect(result.widgetUrl).toContain("/widget/");
    });

    it("should delete sessions", async () => {
      server = new WidgetServer();
      await server.start();

      const result = server.createSession("<html><body>Test</body></html>", {}, "test_tool", "mcp");

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
      const result = server.createSession(widgetHtml, {}, "test_tool", "mcp");

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
        "openai"
      );

      const response = await fetch(result.hostUrl);
      expect(response.status).toBe(200);

      const body = await response.text();
      expect(body).toContain("OpenAI Widget Host");
      expect(body).toContain("iframe");
      expect(body).toContain(result.widgetUrl);
      expect(body).toContain("72");
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
});
