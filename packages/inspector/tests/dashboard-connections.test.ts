/**
 * Dashboard connection endpoint tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "http";
import { ConnectionRegistry } from "../src/connection-registry";
import { ConnectionManager } from "../src/connection";
import { handleDashboardRequest } from "../src/dashboard/dashboard-server";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

const mockState = vi.hoisted(() => {
  const buildClient = (label: string): MockClient => ({
    listTools: vi.fn().mockResolvedValue([{ name: `tool-${label}` }]),
    listResources: vi.fn().mockResolvedValue([]),
    listPrompts: vi.fn().mockResolvedValue([]),
    callTool: vi
      .fn()
      .mockResolvedValue({ content: [{ type: "text", text: `ok-${label}` }], isError: false }),
    getCallHistory: vi.fn().mockReturnValue([]),
    clearHistory: vi.fn().mockReturnValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    raw: {
      getServerVersion: () => ({ name: `server-${label}`, version: `1.0.${label}` }),
    },
  });

  return {
    buildClient,
    clients: [] as MockClient[],
  };
});

vi.mock("@mcp-apps-kit/testing", () => {
  return {
    createTestClient: vi.fn().mockImplementation(async () => {
      const client = mockState.clients.shift();
      if (!client) {
        throw new Error("No mock client available");
      }
      return client;
    }),
  };
});

class MockResponse {
  statusCode: number | undefined;
  headers: Record<string, string> = {};
  body = "";

  setHeader(name: string, value: number | string): void {
    this.headers[name.toLowerCase()] = String(value);
  }

  writeHead(code: number, headers?: Record<string, string>): void {
    this.statusCode = code;
    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        this.headers[key.toLowerCase()] = String(value);
      }
    }
  }

  end(chunk?: string | Buffer): void {
    if (chunk) {
      this.body += typeof chunk === "string" ? chunk : chunk.toString("utf-8");
    }
  }
}

function createRequest(
  method: string,
  url: string,
  body?: Record<string, unknown>
): IncomingMessage {
  const req = new Readable({
    read() {},
  }) as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = { host: "localhost" };
  if (body) {
    req.push(JSON.stringify(body));
  }
  req.push(null);
  return req;
}

describe("Dashboard connections endpoints", () => {
  let connectionManager: ConnectionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.clients.length = 0;
    connectionManager = new ConnectionManager();
  });

  it("GET /dashboard/connections returns list of connections", async () => {
    const registry = new ConnectionRegistry();
    const clientA = mockState.buildClient("alpha");
    const clientB = mockState.buildClient("bravo");
    mockState.clients.push(clientA, clientB);
    await registry.createConnection("http://localhost:3000/mcp");
    await registry.createConnection("http://localhost:3001/mcp");

    const req = createRequest("GET", "/dashboard/connections");
    const res = new MockResponse();

    const handled = await handleDashboardRequest(
      req,
      res as unknown as ServerResponse,
      connectionManager,
      registry
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body) as { connections: { id: string }[] };
    expect(payload.connections).toHaveLength(2);
  });

  it("POST /dashboard/connections creates a new connection", async () => {
    const registry = new ConnectionRegistry();
    mockState.clients.push(mockState.buildClient("alpha"));

    const req = createRequest("POST", "/dashboard/connections", {
      url: "http://localhost:3000/mcp",
    });
    const res = new MockResponse();

    const handled = await handleDashboardRequest(
      req,
      res as unknown as ServerResponse,
      connectionManager,
      registry
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body) as {
      id: string;
      url: string;
      serverInfo: { name: string; version: string } | null;
    };
    expect(payload.id).toMatch(uuidRegex);
    expect(payload.url).toBe("http://localhost:3000/mcp");
    expect(payload.serverInfo?.name).toBe("server-alpha");
  });

  it("DELETE /dashboard/connections/:id closes a connection", async () => {
    const registry = new ConnectionRegistry();
    const clientA = mockState.buildClient("alpha");
    mockState.clients.push(clientA);
    const connection = await registry.createConnection("http://localhost:3000/mcp");

    const req = createRequest("DELETE", `/dashboard/connections/${connection.id}`);
    const res = new MockResponse();

    const handled = await handleDashboardRequest(
      req,
      res as unknown as ServerResponse,
      connectionManager,
      registry
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(clientA.disconnect).toHaveBeenCalledTimes(1);
    expect(registry.listConnections()).toHaveLength(0);
    expect(JSON.parse(res.body)).toEqual({ success: true });
  });

  it("DELETE /dashboard/connections/:id returns 404 for invalid id", async () => {
    const registry = new ConnectionRegistry();
    mockState.clients.push(mockState.buildClient("alpha"));
    await registry.createConnection("http://localhost:3000/mcp");

    const req = createRequest("DELETE", "/dashboard/connections/does-not-exist");
    const res = new MockResponse();

    const handled = await handleDashboardRequest(
      req,
      res as unknown as ServerResponse,
      connectionManager,
      registry
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(404);
    const payload = JSON.parse(res.body) as { error: string };
    expect(payload.error).toContain("Connection not found");
  });

  it("GET /dashboard/connections returns empty array when registry is missing", async () => {
    const req = createRequest("GET", "/dashboard/connections");
    const res = new MockResponse();

    const handled = await handleDashboardRequest(
      req,
      res as unknown as ServerResponse,
      connectionManager
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ connections: [] });
  });
});
