/**
 * Connection registry tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConnectionRegistry } from "../src/connection-registry";

const mockClient = vi.hoisted(() => ({
  listTools: vi.fn().mockResolvedValue([]),
  listResources: vi.fn().mockResolvedValue([]),
  listPrompts: vi.fn().mockResolvedValue([]),
  callTool: vi.fn().mockResolvedValue({ content: [], isError: false }),
  getCallHistory: vi.fn().mockReturnValue([]),
  clearHistory: vi.fn(),
  disconnect: vi.fn().mockResolvedValue(undefined),
  raw: {},
}));

// Mock the @mcp-apps-kit/testing module
vi.mock("@mcp-apps-kit/testing", () => {
  return {
    createTestClient: vi.fn().mockResolvedValue(mockClient),
  };
});

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("ConnectionRegistry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates multiple connections with unique IDs", async () => {
    const registry = new ConnectionRegistry();

    const first = await registry.createConnection({
      transport: "http",
      url: "http://localhost:3000/mcp",
    });
    const second = await registry.createConnection({
      transport: "http",
      url: "http://localhost:3001/mcp",
    });

    expect(first.id).toMatch(uuidRegex);
    expect(second.id).toMatch(uuidRegex);
    expect(first.id).not.toBe(second.id);

    const list = registry.listConnections();
    expect(list).toHaveLength(2);
    for (const item of list) {
      expect(item.id).toMatch(uuidRegex);
    }
  });

  it("resolves connections by explicit ID, then active, then throws", async () => {
    const registry = new ConnectionRegistry();

    const first = await registry.createConnection({
      transport: "http",
      url: "http://localhost:3000/mcp",
    });
    const second = await registry.createConnection({
      transport: "http",
      url: "http://localhost:3001/mcp",
    });

    const explicit = registry.resolveConnection(first.id);
    expect(explicit.id).toBe(first.id);

    const active = registry.resolveConnection();
    expect(active.id).toBe(first.id);

    await registry.closeConnection(first.id);
    await registry.closeConnection(second.id);

    expect(() => registry.resolveConnection()).toThrow("No active connection");
  });

  it("enforces max connections limit", async () => {
    const registry = new ConnectionRegistry({ maxConnections: 1 });

    await registry.createConnection({ transport: "http", url: "http://localhost:3000/mcp" });

    await expect(
      registry.createConnection({ transport: "http", url: "http://localhost:3001/mcp" })
    ).rejects.toThrow("Max connections limit");
  });

  it("closes connections and cleans up state", async () => {
    const registry = new ConnectionRegistry();

    await registry.createConnection({ transport: "http", url: "http://localhost:3000/mcp" });
    const second = await registry.createConnection({
      transport: "http",
      url: "http://localhost:3001/mcp",
    });

    await registry.closeConnection(second.id);
    expect(registry.listConnections()).toHaveLength(1);
    expect(() => registry.getConnection(second.id)).toThrow("Connection not found");

    await registry.closeAll();
    expect(registry.listConnections()).toHaveLength(0);
    expect(() => registry.getActiveConnection()).toThrow("No active connection");
  });
});
