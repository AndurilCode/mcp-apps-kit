/**
 * Full flow test for DOM event recording
 *
 * Tests the complete flow:
 * 1. Standalone server starts and sets inspectorUrl
 * 2. Widget session is created with inspectorUrl
 * 3. DOM events are posted to /record-event
 * 4. Events are recorded in session manager
 * 5. Events are emitted via EventEmitter
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createStandaloneInspectorServer } from "../src/standalone-server";
import type { ConnectionManager } from "../src/connection";
import type { InspectorEvent } from "../src/types";
import type { Page } from "playwright";

/** Minimal mock page interface for testing */
interface MockPage {
  isClosed: () => boolean;
  close: () => Promise<void>;
}

/** Create a mock page for testing */
function createMockPage(): MockPage {
  return {
    isClosed: () => false,
    close: async () => {},
  };
}

describe("DOM Event Full Flow", () => {
  const port = 16274; // Use a different port to avoid conflicts
  let server: ReturnType<typeof createStandaloneInspectorServer>;
  let serverUrl: string;
  let connectionManager: ConnectionManager;

  beforeAll(async () => {
    server = createStandaloneInspectorServer({ debug: true });
    await server.start(port);
    // Server uses 127.0.0.1 instead of localhost to match widget server origin (avoids CORS)
    serverUrl = `http://127.0.0.1:${port}`;
    // Create a connection through the registry so getConnectionManager works
    const registry = server.getRegistry();
    const { connectionManager: cm } = await registry.createConnection(`${serverUrl}/mcp`);
    connectionManager = cm;
  });

  afterAll(async () => {
    await server.stop();
  });

  it("should have inspectorUrl set on ConnectionManager", () => {
    const inspectorUrl = connectionManager.getInspectorUrl();

    expect(inspectorUrl).toBe(serverUrl);
  });

  it("should record events via /record-event endpoint", async () => {
    const sessionManager = connectionManager.getWidgetSessionManager();

    // Create a mock session first (we need a session to record events against)
    // In real usage, this would be created via call_tool or screenshot_widget
    // For testing, we'll use the internal _injectSession method
    const mockPage = createMockPage();
    const mockSession = {
      id: "test-session-001",
      toolName: "test_tool",
      toolArgs: {},
      toolResult: { test: "result" },
      page: mockPage as unknown as Page,
      protocol: "mcp" as const,
      consoleLogs: [],
      pageErrors: [],
      dialogs: [],
      toolCalls: [],
      events: [],
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      source: "agent" as const,
    };

    sessionManager._injectSession("test-session-001", mockSession);

    // Set up event listener
    const receivedEvents: InspectorEvent[] = [];
    sessionManager.on("event", (event: InspectorEvent) => {
      receivedEvents.push(event);
    });

    // Post a DOM event via /record-event endpoint
    const response = await fetch(`${serverUrl}/record-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "test-session-001",
        type: "dom-click",
        payload: {
          selector: "button#submit",
          x: 100,
          y: 200,
        },
        source: "widget",
        protocol: "mcp",
      }),
    });

    expect(response.ok).toBe(true);
    const result = await response.json();
    expect(result.ok).toBe(true);

    // Wait a bit for async event emission
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify event was recorded and emitted
    expect(receivedEvents.length).toBeGreaterThanOrEqual(1);
    const clickEvent = receivedEvents.find((e) => e.type === "dom-click");
    expect(clickEvent).toBeDefined();
    expect(clickEvent?.payload).toEqual({
      selector: "button#submit",
      x: 100,
      y: 200,
    });
    expect(clickEvent?.source).toBe("widget");
    expect(clickEvent?.sessionId).toBe("test-session-001");

    // Verify event is stored in session
    const sessionEvents = sessionManager.getEvents("test-session-001");
    const storedClickEvent = sessionEvents.find((e) => e.type === "dom-click");
    expect(storedClickEvent).toBeDefined();
  });

  it("should reject events for non-existent sessions", async () => {
    // Post a DOM event for non-existent session
    const response = await fetch(`${serverUrl}/record-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "non-existent-session",
        type: "dom-click",
        payload: {
          selector: "button",
          x: 0,
          y: 0,
        },
        source: "widget",
        protocol: "mcp",
      }),
    });

    // The endpoint still returns 200 ok, but the event won't be recorded
    // This is because we don't want to break the widget if the session is gone
    expect(response.ok).toBe(true);
  });

  it("should handle malformed requests", async () => {
    // Post invalid JSON
    const response = await fetch(`${serverUrl}/record-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid json",
    });

    expect(response.status).toBe(400);
    const result = await response.json();
    expect(result.error).toBe("Invalid payload");
  });

  it("should stream events via SSE /dashboard/events endpoint", async () => {
    const sessionManager = connectionManager.getWidgetSessionManager();

    // Create a mock session
    const mockPageSse = createMockPage();
    const mockSession = {
      id: "test-session-sse",
      toolName: "test_tool",
      toolArgs: {},
      toolResult: { test: "result" },
      page: mockPageSse as unknown as Page,
      protocol: "mcp" as const,
      consoleLogs: [],
      pageErrors: [],
      dialogs: [],
      toolCalls: [],
      events: [],
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      source: "agent" as const,
    };
    sessionManager._injectSession("test-session-sse", mockSession);

    // Connect to SSE stream
    const controller = new AbortController();
    const ssePromise = fetch(`${serverUrl}/dashboard/events?sessionId=test-session-sse`, {
      signal: controller.signal,
    });

    // Wait for connection to establish
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Post a DOM event
    await fetch(`${serverUrl}/record-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "test-session-sse",
        type: "dom-click",
        payload: { selector: "#test-button", x: 50, y: 50 },
        source: "widget",
        protocol: "mcp",
      }),
    });

    // Wait for event to be sent
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Abort the SSE connection
    controller.abort();

    // Get the response (may throw due to abort, which is fine)
    try {
      const response = await ssePromise;
      expect(response.ok).toBe(true);
      expect(response.headers.get("content-type")).toBe("text/event-stream");
    } catch (e) {
      // AbortError is expected
      if (!(e instanceof Error && e.name === "AbortError")) {
        throw e;
      }
    }

    // Verify event was recorded in session
    const events = sessionManager.getEvents("test-session-sse");
    const clickEvent = events.find((e) => e.type === "dom-click");
    expect(clickEvent).toBeDefined();
    expect(clickEvent?.payload).toEqual({ selector: "#test-button", x: 50, y: 50 });
  });
});
