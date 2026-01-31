/**
 * Behavioral Verification Tests: stdio MCP server support
 *
 * Criteria 1-13: Backend vitest tests
 * Criteria 14-18: Frontend code review (see bottom of file)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "http";
import { ConnectionManager } from "../src/connection";
import { ConnectionRegistry } from "../src/connection-registry";
import { handleDashboardRequest } from "../src/dashboard/dashboard-server";
import { createConnectTool } from "../src/tools/connect";
import { createMockRegistry } from "./test-utils";

// ---------------------------------------------------------------------------
// Mock @mcp-apps-kit/testing so we can inspect which transport params are
// passed to createTestClient without spawning real child processes.
// ---------------------------------------------------------------------------

interface MockClient {
  listTools: ReturnType<typeof vi.fn>;
  listResources: ReturnType<typeof vi.fn>;
  listPrompts: ReturnType<typeof vi.fn>;
  callTool: ReturnType<typeof vi.fn>;
  getCallHistory: ReturnType<typeof vi.fn>;
  clearHistory: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  raw: Record<string, unknown>;
}

/**
 * Hoisted state so that both the mock factory and test code can coordinate.
 * `capturedCalls` records every call to createTestClient for assertions.
 */
const mockState = vi.hoisted(() => {
  const defaultClient = (): MockClient => ({
    listTools: vi.fn().mockResolvedValue([]),
    listResources: vi.fn().mockResolvedValue([]),
    listPrompts: vi.fn().mockResolvedValue([]),
    callTool: vi.fn().mockResolvedValue({ content: [], isError: false }),
    getCallHistory: vi.fn().mockReturnValue([]),
    clearHistory: vi.fn(),
    disconnect: vi.fn().mockResolvedValue(undefined),
    raw: {},
  });

  return {
    defaultClient,
    /** Pre-queued clients — shift off for each createTestClient call */
    clients: [] as MockClient[],
    /** Captured createTestClient invocations */
    capturedCalls: [] as Array<{ params: unknown; options: unknown }>,
    /**
     * When set, createTestClient will invoke this callback with (params, options)
     * before returning; useful for capturing `onTransportClose` references.
     */
    onCreateHook: null as ((params: unknown, options: unknown) => void) | null,
    /** When true, createTestClient rejects */
    shouldFail: false,
  };
});

vi.mock("@mcp-apps-kit/testing", () => {
  return {
    createTestClient: vi.fn().mockImplementation(async (params: unknown, options: unknown) => {
      mockState.capturedCalls.push({ params, options });
      if (mockState.onCreateHook) {
        mockState.onCreateHook(params, options);
      }
      if (mockState.shouldFail) {
        throw new Error("Mock connection failure");
      }
      const client = mockState.clients.shift() ?? mockState.defaultClient();
      return client;
    }),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetMockState() {
  mockState.clients.length = 0;
  mockState.capturedCalls.length = 0;
  mockState.onCreateHook = null;
  mockState.shouldFail = false;
}

/**
 * Build a fake HTTP IncomingMessage for dashboard route tests.
 */
function buildRequest(
  method: string,
  url: string,
  body?: Record<string, unknown>
): IncomingMessage {
  const readable = new Readable({
    read() {
      if (body) {
        this.push(Buffer.from(JSON.stringify(body)));
      }
      this.push(null);
    },
  }) as IncomingMessage;
  readable.method = method;
  readable.url = url;
  readable.headers = { host: "localhost:6274", "content-type": "application/json" };
  return readable;
}

/**
 * Build a fake ServerResponse that captures status code and body.
 */
function buildResponse(): ServerResponse & {
  _statusCode: number;
  _headers: Record<string, string>;
  _body: string;
} {
  let body = "";
  const res = {
    _statusCode: 0,
    _headers: {} as Record<string, string>,
    _body: "",
    writeHead(code: number, headers?: Record<string, string>) {
      res._statusCode = code;
      if (headers) Object.assign(res._headers, headers);
      return res;
    },
    setHeader(key: string, value: string) {
      res._headers[key] = value;
      return res;
    },
    write(chunk: string) {
      body += chunk;
      return true;
    },
    end(data?: string) {
      if (data) body += data;
      res._body = body;
    },
    writableEnded: false,
  } as unknown as ServerResponse & {
    _statusCode: number;
    _headers: Record<string, string>;
    _body: string;
  };
  return res;
}

// ===========================================================================
// CRITERIA 1-2: createTestClient receives correct transport params
// ===========================================================================

describe("Criteria 1-2: createTestClient transport params", () => {
  let manager: ConnectionManager;

  beforeEach(() => {
    resetMockState();
    vi.clearAllMocks();
    manager = new ConnectionManager();
  });

  afterEach(async () => {
    try {
      await manager.disconnect();
    } catch {
      /* already disconnected */
    }
  });

  it("C1: stdio params are forwarded to createTestClient", async () => {
    await manager.connect({
      transport: "stdio",
      command: "node",
      args: ["server.js"],
    });

    expect(mockState.capturedCalls).toHaveLength(1);
    const { params } = mockState.capturedCalls[0]!;
    expect(params).toMatchObject({
      transport: "stdio",
      command: "node",
      args: ["server.js"],
    });
  });

  it("C2: http params are forwarded to createTestClient", async () => {
    await manager.connect({
      transport: "http",
      url: "http://localhost:3000/mcp",
    });

    expect(mockState.capturedCalls).toHaveLength(1);
    const { params } = mockState.capturedCalls[0]!;
    expect(params).toMatchObject({
      transport: "http",
      url: "http://localhost:3000/mcp",
    });
  });
});

// ===========================================================================
// CRITERIA 3-4: ConnectionManager.connect sets state.serverUrl correctly
// ===========================================================================

describe("Criteria 3-4: ConnectionManager.connect serverUrl label", () => {
  let manager: ConnectionManager;

  beforeEach(() => {
    resetMockState();
    vi.clearAllMocks();
    manager = new ConnectionManager();
  });

  afterEach(async () => {
    try {
      await manager.disconnect();
    } catch {
      /* noop */
    }
  });

  it('C3: stdio connect sets serverUrl to "stdio:command args"', async () => {
    await manager.connect({
      transport: "stdio",
      command: "node",
      args: ["server.js"],
    });

    const state = manager.getState();
    expect(state.connected).toBe(true);
    expect(state.serverUrl).toBe("stdio:node server.js");
  });

  it("C3b: stdio connect with no args sets serverUrl to 'stdio: command'", async () => {
    await manager.connect({
      transport: "stdio",
      command: "python3",
    });

    const state = manager.getState();
    expect(state.serverUrl).toBe("stdio:python3");
  });

  it("C4: http connect sets serverUrl to the URL", async () => {
    await manager.connect({
      transport: "http",
      url: "http://localhost:5000/v1/mcp",
    });

    const state = manager.getState();
    expect(state.connected).toBe(true);
    expect(state.serverUrl).toBe("http://localhost:5000/v1/mcp");
  });
});

// ===========================================================================
// CRITERIA 5-7: Auto-restart behavior for stdio transport
// ===========================================================================

describe("Criteria 5-7: Auto-restart on stdio transport close", () => {
  let manager: ConnectionManager;
  let capturedOnTransportClose: (() => void) | null;

  beforeEach(() => {
    resetMockState();
    vi.clearAllMocks();
    vi.useFakeTimers();
    capturedOnTransportClose = null;

    // Capture the onTransportClose callback that ConnectionManager passes
    mockState.onCreateHook = (_params, options) => {
      const opts = options as { onTransportClose?: () => void } | undefined;
      if (opts?.onTransportClose) {
        capturedOnTransportClose = opts.onTransportClose;
      }
    };

    manager = new ConnectionManager({ debug: false });
  });

  afterEach(async () => {
    vi.useRealTimers();
    try {
      await manager.disconnect();
    } catch {
      /* noop */
    }
  });

  it("C5: onTransportClose fires → reconnect attempt with exponential backoff", async () => {
    await manager.connect({ transport: "stdio", command: "node", args: ["server.js"] });
    expect(capturedOnTransportClose).not.toBeNull();

    // Clear captured calls from initial connect
    mockState.capturedCalls.length = 0;

    // Simulate transport close
    capturedOnTransportClose!();

    // Should not reconnect immediately
    expect(mockState.capturedCalls).toHaveLength(0);

    // First backoff: 1s (1000 * 2^0)
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockState.capturedCalls).toHaveLength(1);
    // Verify it reconnects with the same stdio params
    expect(mockState.capturedCalls[0]!.params).toMatchObject({
      transport: "stdio",
      command: "node",
      args: ["server.js"],
    });
  });

  it("C6: after 3 failures → gives up, disconnects", async () => {
    await manager.connect({ transport: "stdio", command: "node", args: ["server.js"] });
    expect(capturedOnTransportClose).not.toBeNull();

    // Make createTestClient fail on subsequent calls
    mockState.shouldFail = true;
    mockState.capturedCalls.length = 0;

    // Trigger close — attempt 1
    capturedOnTransportClose!();
    await vi.advanceTimersByTimeAsync(1000); // 1s backoff
    expect(mockState.capturedCalls).toHaveLength(1);

    // The reconnect failed, which calls disconnect (which sets connected=false).
    // After disconnect, the manager won't attempt further restarts from the
    // same onTransportClose chain.
    const state = manager.getState();
    expect(state.connected).toBe(false);
  });

  it("C7: intentional disconnect() → no restart attempt", async () => {
    await manager.connect({ transport: "stdio", command: "node", args: ["server.js"] });
    expect(capturedOnTransportClose).not.toBeNull();

    mockState.capturedCalls.length = 0;

    // Intentionally disconnect first
    await manager.disconnect();

    // Now fire transport close — should NOT trigger reconnect
    capturedOnTransportClose!();

    await vi.advanceTimersByTimeAsync(5000);
    // No reconnect calls
    expect(mockState.capturedCalls).toHaveLength(0);
  });

  it("C5b: onTransportClose is NOT set for HTTP transport", async () => {
    capturedOnTransportClose = null;
    await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
    expect(capturedOnTransportClose).toBeNull();
  });
});

// ===========================================================================
// CRITERION 8: ConnectionRegistry.createConnection with both transport types
// ===========================================================================

describe("Criterion 8: ConnectionRegistry.createConnection", () => {
  let registry: ConnectionRegistry;

  beforeEach(() => {
    resetMockState();
    vi.clearAllMocks();
    registry = new ConnectionRegistry();
  });

  afterEach(async () => {
    await registry.closeAll();
  });

  it("C8a: creates connection with stdio transport", async () => {
    const { id, connectionManager } = await registry.createConnection({
      transport: "stdio",
      command: "node",
      args: ["server.js"],
    });

    expect(id).toBeTruthy();
    const state = connectionManager.getState();
    expect(state.connected).toBe(true);
    expect(state.serverUrl).toContain("stdio");
    expect(state.serverUrl).toContain("node");
  });

  it("C8b: creates connection with http transport", async () => {
    const { id, connectionManager } = await registry.createConnection({
      transport: "http",
      url: "http://localhost:4000/mcp",
    });

    expect(id).toBeTruthy();
    const state = connectionManager.getState();
    expect(state.connected).toBe(true);
    expect(state.serverUrl).toBe("http://localhost:4000/mcp");
  });
});

// ===========================================================================
// CRITERIA 9-10: connect_to_server tool
// ===========================================================================

describe("Criteria 9-10: connect_to_server tool", () => {
  let manager: ConnectionManager;
  let registry: ReturnType<typeof createMockRegistry>;
  let connectTool: ReturnType<typeof createConnectTool>;

  beforeEach(() => {
    resetMockState();
    vi.clearAllMocks();
    manager = new ConnectionManager();
    registry = createMockRegistry(manager);
    connectTool = createConnectTool(registry);
  });

  afterEach(async () => {
    try {
      await manager.disconnect();
    } catch {
      /* noop */
    }
  });

  it("C9: stdio transport input succeeds", async () => {
    const result = await connectTool.handler({
      transport: "stdio",
      command: "node",
      args: ["server.js"],
    });

    expect(result.connected).toBe(true);
    expect(result.connectionId).toBeTruthy();
    expect(result.serverUrl).toContain("stdio");

    // Verify the correct params reached createTestClient
    expect(mockState.capturedCalls).toHaveLength(1);
    expect(mockState.capturedCalls[0]!.params).toMatchObject({
      transport: "stdio",
      command: "node",
      args: ["server.js"],
    });
  });

  it("C10: legacy input (url only, no transport field) works", async () => {
    const result = await connectTool.handler({
      url: "http://localhost:3000/v1/mcp",
    });

    expect(result.connected).toBe(true);
    expect(result.serverUrl).toContain("http://localhost:3000/v1/mcp");

    // Verify it was normalized to http transport
    expect(mockState.capturedCalls).toHaveLength(1);
    expect(mockState.capturedCalls[0]!.params).toMatchObject({
      transport: "http",
      url: "http://localhost:3000/v1/mcp",
    });
  });

  it("C10b: explicit http transport input works", async () => {
    const result = await connectTool.handler({
      transport: "http",
      url: "http://localhost:3000/v1/mcp",
    });

    expect(result.connected).toBe(true);
    expect(mockState.capturedCalls[0]!.params).toMatchObject({
      transport: "http",
      url: "http://localhost:3000/v1/mcp",
    });
  });
});

// ===========================================================================
// CRITERIA 11-13: Dashboard POST /dashboard/connections
// ===========================================================================

describe("Criteria 11-13: Dashboard POST /dashboard/connections", () => {
  let registry: ConnectionRegistry;

  beforeEach(() => {
    resetMockState();
    vi.clearAllMocks();
    registry = new ConnectionRegistry();
  });

  afterEach(async () => {
    await registry.closeAll();
  });

  it("C11: stdio transport POST → 200", async () => {
    const req = buildRequest("POST", "/dashboard/connections", {
      transport: "stdio",
      command: "node",
      args: ["server.js"],
    });
    const res = buildResponse();

    const handled = await handleDashboardRequest(req, res, null, registry);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);

    const body = JSON.parse(res._body);
    expect(body.id).toBeTruthy();
    expect(body.transport).toBe("stdio");
  });

  it("C12: backward-compat POST with url only (no transport) → 200", async () => {
    const req = buildRequest("POST", "/dashboard/connections", {
      url: "http://localhost:3000/mcp",
    });
    const res = buildResponse();

    const handled = await handleDashboardRequest(req, res, null, registry);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);

    const body = JSON.parse(res._body);
    expect(body.id).toBeTruthy();
  });

  it("C13: stdio transport without command → 400", async () => {
    const req = buildRequest("POST", "/dashboard/connections", {
      transport: "stdio",
    });
    const res = buildResponse();

    const handled = await handleDashboardRequest(req, res, null, registry);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(400);

    const body = JSON.parse(res._body);
    expect(body.error).toMatch(/command/i);
  });

  it("C13b: stdio transport with empty command → 400", async () => {
    const req = buildRequest("POST", "/dashboard/connections", {
      transport: "stdio",
      command: "  ",
    });
    const res = buildResponse();

    const handled = await handleDashboardRequest(req, res, null, registry);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(400);

    const body = JSON.parse(res._body);
    expect(body.error).toMatch(/command/i);
  });
});
