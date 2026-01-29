/**
 * Multi-connection tool tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConnectionRegistry } from "../src/connection-registry";
import {
  createConnectTool,
  createDisconnectTool,
  createListConnectionsTool,
  createGetConnectionStatusTool,
  createListToolsTool,
  createListResourcesTool,
  createListPromptsTool,
  createCallToolTool,
} from "../src/tools";

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
    listResources: vi
      .fn()
      .mockResolvedValue([
        { uri: `res-${label}`, name: `Resource ${label}`, description: `Desc ${label}` },
      ]),
    listPrompts: vi
      .fn()
      .mockResolvedValue([{ name: `prompt-${label}`, description: `Prompt ${label}` }]),
    callTool: vi
      .fn()
      .mockResolvedValue({ content: [{ type: "text", text: `ok-${label}` }], isError: false }),
    getCallHistory: vi.fn().mockReturnValue([]),
    clearHistory: vi.fn().mockReturnValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    raw: {},
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

describe("Multi-connection tools", () => {
  let clientA: MockClient;
  let clientB: MockClient;
  let clientC: MockClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.clients.length = 0;
    clientA = mockState.buildClient("alpha");
    clientB = mockState.buildClient("bravo");
    clientC = mockState.buildClient("charlie");
    mockState.clients.push(clientA, clientB, clientC);
  });

  it("connect tool creates connection via registry and returns connectionId", async () => {
    const registry = new ConnectionRegistry();
    const tool = createConnectTool(registry);

    const result = await tool.handler({ url: "http://localhost:3000/mcp" }, {} as never);

    expect(result.connected).toBe(true);
    expect(result.connectionId).toBe("conn-1");
    expect(registry.listConnections()).toHaveLength(1);
  });

  it("disconnect tool closes specific connection by connectionId", async () => {
    const registry = new ConnectionRegistry();
    const first = await registry.createConnection("http://localhost:3000/mcp");
    const second = await registry.createConnection("http://localhost:3001/mcp");
    const tool = createDisconnectTool(registry);

    const result = await tool.handler({ connectionId: first.id }, {} as never);

    expect(result.disconnected).toBe(true);
    expect(result.connectionId).toBe(first.id);
    expect(registry.listConnections().map((conn) => conn.id)).toEqual([second.id]);
    expect(clientA.disconnect).toHaveBeenCalledTimes(1);
  });

  it("disconnect tool closes active connection when connectionId is omitted", async () => {
    const registry = new ConnectionRegistry();
    const first = await registry.createConnection("http://localhost:3000/mcp");
    const second = await registry.createConnection("http://localhost:3001/mcp");
    const tool = createDisconnectTool(registry);

    const result = await tool.handler({}, {} as never);

    expect(result.connectionId).toBe(second.id);
    expect(registry.listConnections().map((conn) => conn.id)).toEqual([first.id]);
    expect(clientB.disconnect).toHaveBeenCalledTimes(1);
  });

  it("list_connections tool returns all connections", async () => {
    const registry = new ConnectionRegistry();
    const first = await registry.createConnection("http://localhost:3000/mcp");
    const second = await registry.createConnection("http://localhost:3001/mcp");
    const tool = createListConnectionsTool(registry);

    const result = await tool.handler({}, {} as never);

    expect(result.count).toBe(2);
    expect(result.connections.map((conn) => conn.id)).toEqual([first.id, second.id]);
  });

  it("status tool returns single connection when connectionId given", async () => {
    const registry = new ConnectionRegistry();
    const first = await registry.createConnection("http://localhost:3000/mcp");
    await registry.createConnection("http://localhost:3001/mcp");
    const tool = createGetConnectionStatusTool(registry);

    const result = await tool.handler({ connectionId: first.id }, {} as never);

    expect(result.connections).toHaveLength(1);
    expect(result.connections[0].id).toBe(first.id);
    expect(result.activeConnectionId).toBe(first.id);
  });

  it("status tool returns all connections when connectionId is omitted", async () => {
    const registry = new ConnectionRegistry();
    await registry.createConnection("http://localhost:3000/mcp");
    await registry.createConnection("http://localhost:3001/mcp");
    const tool = createGetConnectionStatusTool(registry);

    const result = await tool.handler({}, {} as never);

    expect(result.connections).toHaveLength(2);
    expect(result.activeConnectionId).toBe(null);
  });

  it("list_tools resolves connection by connectionId", async () => {
    const registry = new ConnectionRegistry();
    const first = await registry.createConnection("http://localhost:3000/mcp");
    await registry.createConnection("http://localhost:3001/mcp");
    const tool = createListToolsTool(registry);

    const initialA = clientA.listTools.mock.calls.length;
    const initialB = clientB.listTools.mock.calls.length;
    const result = await tool.handler({ connectionId: first.id }, {} as never);

    expect(result.tools[0]?.name).toBe("tool-alpha");
    expect(clientA.listTools.mock.calls.length).toBe(initialA + 1);
    expect(clientB.listTools.mock.calls.length).toBe(initialB);
  });

  it("list_resources resolves connection by connectionId", async () => {
    const registry = new ConnectionRegistry();
    await registry.createConnection("http://localhost:3000/mcp");
    const second = await registry.createConnection("http://localhost:3001/mcp");
    const tool = createListResourcesTool(registry);

    const initialA = clientA.listResources.mock.calls.length;
    const initialB = clientB.listResources.mock.calls.length;
    const result = await tool.handler({ connectionId: second.id }, {} as never);

    expect(result.resources[0]?.uri).toBe("res-bravo");
    expect(clientB.listResources.mock.calls.length).toBe(initialB + 1);
    expect(clientA.listResources.mock.calls.length).toBe(initialA);
  });

  it("list_prompts resolves connection by connectionId", async () => {
    const registry = new ConnectionRegistry();
    const first = await registry.createConnection("http://localhost:3000/mcp");
    await registry.createConnection("http://localhost:3001/mcp");
    const tool = createListPromptsTool(registry);

    const initialA = clientA.listPrompts.mock.calls.length;
    const initialB = clientB.listPrompts.mock.calls.length;
    const result = await tool.handler({ connectionId: first.id }, {} as never);

    expect(result.prompts[0]?.name).toBe("prompt-alpha");
    expect(clientA.listPrompts.mock.calls.length).toBe(initialA + 1);
    expect(clientB.listPrompts.mock.calls.length).toBe(initialB);
  });

  it("call_tool resolves connection by connectionId", async () => {
    const registry = new ConnectionRegistry();
    await registry.createConnection("http://localhost:3000/mcp");
    const second = await registry.createConnection("http://localhost:3001/mcp");
    const tool = createCallToolTool(registry);

    const result = await tool.handler(
      { connectionId: second.id, name: "ping", arguments: { value: 1 } },
      {} as never
    );

    expect(result.content[0]?.text).toBe("ok-bravo");
    expect(clientB.callTool).toHaveBeenCalledWith("ping", { value: 1 });
    expect(clientA.callTool).not.toHaveBeenCalled();
  });
});
