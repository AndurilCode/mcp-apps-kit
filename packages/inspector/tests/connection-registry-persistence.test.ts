/**
 * Tests for ServerStore wiring in ConnectionRegistry (TASK-029-03)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConnectionRegistry } from "../src/connection-registry";
import type { ServerStore, PersistedServerEntry } from "../src/persistence/server-store";

// Mock the @mcp-apps-kit/testing module
vi.mock("@mcp-apps-kit/testing", () => {
  const mockClient = {
    listTools: vi.fn().mockResolvedValue([]),
    listResources: vi.fn().mockResolvedValue([]),
    listPrompts: vi.fn().mockResolvedValue([]),
    callTool: vi.fn().mockResolvedValue({ content: [], isError: false }),
    getCallHistory: vi.fn().mockReturnValue([]),
    clearHistory: vi.fn(),
    disconnect: vi.fn().mockResolvedValue(undefined),
    raw: {
      getServerVersion: () => ({ name: "test-server", version: "1.0.0" }),
    },
  };

  return {
    createTestClient: vi.fn().mockResolvedValue(mockClient),
  };
});

function createMockServerStore(): ServerStore {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(true),
    listAll: vi.fn().mockResolvedValue([]),
    migrate: vi.fn().mockResolvedValue(0),
    isEmpty: vi.fn().mockResolvedValue(true),
    clear: vi.fn().mockResolvedValue(undefined),
    getConfigDir: vi.fn().mockReturnValue("/tmp/test"),
    getFilePath: vi.fn().mockReturnValue("/tmp/test/servers.json"),
    exists: vi.fn().mockResolvedValue(false),
  } as unknown as ServerStore;
}

describe("ConnectionRegistry persistence", () => {
  let store: ServerStore;
  let registry: ConnectionRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createMockServerStore();
    registry = new ConnectionRegistry({ serverStore: store });
  });

  describe("createConnection saves to store", () => {
    it("should call serverStore.save after successful connection", async () => {
      const { id } = await registry.createConnection({
        transport: "http",
        url: "http://localhost:3000/mcp",
      });

      expect(store.save).toHaveBeenCalled();
      const saveCalls = (store.save as ReturnType<typeof vi.fn>).mock.calls;
      const entry = saveCalls[saveCalls.length - 1][0] as PersistedServerEntry;
      expect(entry.id).toBe(id);
      expect(entry.name).toBe("test-server");
      expect(entry.transport).toBe("http");
      expect(entry.url).toBe("http://localhost:3000/mcp");
      expect(entry.params).toEqual({ transport: "http", url: "http://localhost:3000/mcp" });
      expect(entry.hasOAuth).toBe(false);
      expect(typeof entry.addedAt).toBe("number");
    });

    it("should NOT save when ephemeral: true", async () => {
      await registry.createConnection(
        { transport: "http", url: "http://localhost:3000/mcp" },
        { ephemeral: true }
      );

      expect(store.save).not.toHaveBeenCalled();
    });

    it("should NOT save when no serverStore is configured", async () => {
      const noStoreRegistry = new ConnectionRegistry();
      await noStoreRegistry.createConnection({
        transport: "http",
        url: "http://localhost:3000/mcp",
      });

      // store.save on the original store should not be called
      expect(store.save).not.toHaveBeenCalled();
    });

    it("should save stdio connections with command+args as url", async () => {
      await registry.createConnection({
        transport: "stdio",
        command: "node",
        args: ["server.js", "--port", "3000"],
      });

      const saveCalls = (store.save as ReturnType<typeof vi.fn>).mock.calls;
      const entry = saveCalls[saveCalls.length - 1][0] as PersistedServerEntry;
      expect(entry.transport).toBe("stdio");
      expect(entry.url).toBe("node server.js --port 3000");
    });

    it("should not fail connection if store.save rejects", async () => {
      (store.save as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("disk full"));

      const { id } = await registry.createConnection({
        transport: "http",
        url: "http://localhost:3000/mcp",
      });

      expect(id).toBeDefined();
    });
  });

  describe("deleteServer", () => {
    it("should call serverStore.delete with the id", async () => {
      const result = await registry.deleteServer("some-id");
      expect(store.delete).toHaveBeenCalledWith("some-id");
      expect(result).toBe(true);
    });

    it("should return false when no store is configured", async () => {
      const noStoreRegistry = new ConnectionRegistry();
      const result = await noStoreRegistry.deleteServer("some-id");
      expect(result).toBe(false);
    });

    it("should return false when server not found in store", async () => {
      (store.delete as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      const result = await registry.deleteServer("nonexistent");
      expect(result).toBe(false);
    });
  });
});
