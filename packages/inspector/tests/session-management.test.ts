/**
 * Tests for session management tools
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConnectionManager } from "../src/connection";
import {
  createListSessionsTool,
  createCloseSessionTool,
  createCloseAllSessionsTool,
} from "../src/tools/session-management";

// Mock testing module
vi.mock("@mcp-apps-kit/testing", () => {
  return {
    createTestClient: vi.fn().mockImplementation(() =>
      Promise.resolve({
        listTools: vi.fn().mockResolvedValue([]),
        listResources: vi.fn().mockResolvedValue([]),
        listPrompts: vi.fn().mockResolvedValue([]),
        callTool: vi.fn(),
        disconnect: vi.fn(),
        getCallHistory: vi.fn().mockReturnValue([]),
        clearHistory: vi.fn(),
        raw: {},
      })
    ),
  };
});

describe("Session Management Tools", () => {
  let manager: ConnectionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new ConnectionManager();
  });

  describe("list_sessions", () => {
    it("should return empty sessions when no active sessions", async () => {
      const tool = createListSessionsTool(manager);
      const result = await tool.handler({}, {} as never);

      expect(result.sessions).toEqual([]);
      expect(result.count).toBe(0);
    });

    it("should have correct tool metadata", () => {
      const tool = createListSessionsTool(manager);

      expect(tool.description).toBe("List all active widget rendering sessions");
    });
  });

  describe("close_session", () => {
    it("should return closed=false and message when session not found", async () => {
      const tool = createCloseSessionTool(manager);
      const result = await tool.handler({ sessionId: "non-existent-id" }, {} as never);

      expect(result.closed).toBe(false);
      expect(result.message).toBe("Session non-existent-id not found");
    });

    it("should have correct tool metadata", () => {
      const tool = createCloseSessionTool(manager);

      expect(tool.description).toBe(
        "Close a specific widget rendering session and clean up resources"
      );
    });
  });

  describe("close_all_sessions", () => {
    it("should return closed=0 with message when no sessions", async () => {
      const tool = createCloseAllSessionsTool(manager);
      const result = await tool.handler({}, {} as never);

      expect(result.closed).toBe(0);
      expect(result.message).toBe("No active sessions to close");
    });

    it("should have correct tool metadata", () => {
      const tool = createCloseAllSessionsTool(manager);

      expect(tool.description).toBe(
        "Close all active widget rendering sessions and clean up resources"
      );
    });
  });
});
