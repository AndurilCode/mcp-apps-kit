/**
 * History tracking tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConnectionManager } from "../src/connection";
import { createGetCallHistoryTool, createClearHistoryTool } from "../src/tools";
import { createMockRegistry } from "./test-utils";

// Mock the @mcp-apps-kit/testing module
const mockListTools = vi.fn();
const mockListResources = vi.fn();
const mockListPrompts = vi.fn();
const mockDisconnect = vi.fn();
const mockGetCallHistory = vi.fn();
const mockClearHistory = vi.fn();

vi.mock("@mcp-apps-kit/testing", () => {
  return {
    createTestClient: vi.fn().mockImplementation(() =>
      Promise.resolve({
        listTools: mockListTools,
        listResources: mockListResources,
        listPrompts: mockListPrompts,
        disconnect: mockDisconnect,
        getCallHistory: mockGetCallHistory,
        clearHistory: mockClearHistory,
        raw: {},
      })
    ),
  };
});

describe("History Tools", () => {
  let manager: ConnectionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new ConnectionManager();

    mockListTools.mockResolvedValue([]);
    mockListResources.mockResolvedValue([]);
    mockListPrompts.mockResolvedValue([]);
    mockDisconnect.mockResolvedValue(undefined);
    mockGetCallHistory.mockReturnValue([]);
    mockClearHistory.mockReturnValue(undefined);
  });

  afterEach(async () => {
    await manager.disconnect();
  });

  describe("get_call_history", () => {
    it("should return empty history when no calls made", async () => {
      await manager.connect("http://localhost:3000/mcp");

      const tool = createGetCallHistoryTool(createMockRegistry(manager));
      const result = await tool.handler({}, {} as never);

      expect(result.history).toEqual([]);
      expect(result.totalCalls).toBe(0);
      expect(result.errorCount).toBe(0);
      expect(result.averageDuration).toBe(0);
    });

    it("should return history with statistics", async () => {
      const mockHistory = [
        {
          name: "greet",
          args: { name: "Alice" },
          result: { content: [{ type: "text", text: "Hello Alice" }], isError: false },
          duration: 100,
          timestamp: new Date("2026-01-23T12:00:00Z"),
        },
        {
          name: "greet",
          args: { name: "Bob" },
          result: { content: [{ type: "text", text: "Hello Bob" }], isError: false },
          duration: 150,
          timestamp: new Date("2026-01-23T12:00:01Z"),
        },
      ];
      mockGetCallHistory.mockReturnValue(mockHistory);

      await manager.connect("http://localhost:3000/mcp");

      const tool = createGetCallHistoryTool(createMockRegistry(manager));
      const result = await tool.handler({}, {} as never);

      expect(result.totalCalls).toBe(2);
      expect(result.errorCount).toBe(0);
      expect(result.averageDuration).toBe(125);
      expect(result.history).toHaveLength(2);
    });

    it("should count errors in history", async () => {
      const mockHistory = [
        {
          name: "greet",
          args: { name: "Alice" },
          result: { content: [{ type: "text", text: "Hello Alice" }], isError: false },
          duration: 100,
          timestamp: new Date("2026-01-23T12:00:00Z"),
        },
        {
          name: "greet",
          args: {},
          result: { content: [{ type: "text", text: "Error" }], isError: true },
          duration: 50,
          timestamp: new Date("2026-01-23T12:00:01Z"),
        },
      ];
      mockGetCallHistory.mockReturnValue(mockHistory);

      await manager.connect("http://localhost:3000/mcp");

      const tool = createGetCallHistoryTool(createMockRegistry(manager));
      const result = await tool.handler({}, {} as never);

      expect(result.totalCalls).toBe(2);
      expect(result.errorCount).toBe(1);
    });

    it("should return message when history disabled", async () => {
      await manager.connect("http://localhost:3000/mcp", { trackHistory: false });

      const tool = createGetCallHistoryTool(createMockRegistry(manager));
      const result = await tool.handler({}, {} as never);

      expect(result.history).toEqual([]);
      expect(result.message).toContain("History tracking is disabled");
    });
  });

  describe("clear_history", () => {
    it("should clear history and return previous count", async () => {
      const mockHistory = [
        {
          name: "greet",
          args: { name: "Alice" },
          result: { content: [], isError: false },
          duration: 100,
          timestamp: new Date(),
        },
        {
          name: "greet",
          args: { name: "Bob" },
          result: { content: [], isError: false },
          duration: 100,
          timestamp: new Date(),
        },
      ];
      mockGetCallHistory.mockReturnValue(mockHistory);

      await manager.connect("http://localhost:3000/mcp");

      const tool = createClearHistoryTool(createMockRegistry(manager));
      const result = await tool.handler({}, {} as never);

      expect(result.cleared).toBe(true);
      expect(result.previousCount).toBe(2);
    });

    it("should return 0 when history already empty", async () => {
      await manager.connect("http://localhost:3000/mcp");

      const tool = createClearHistoryTool(createMockRegistry(manager));
      const result = await tool.handler({}, {} as never);

      expect(result.cleared).toBe(true);
      expect(result.previousCount).toBe(0);
    });
  });
});
