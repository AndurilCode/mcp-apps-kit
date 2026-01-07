/**
 * Integration tests for behavior testing workflow
 *
 * These tests verify the full behavior testing workflow end-to-end
 * using mock clients to simulate MCP tool calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { defineTestSuite, runTestSuite, expectToolResult } from "../../src/eval/behavior";
import type { TestClient, ToolResult } from "../../src/types";

/**
 * Create a mock test client for testing the test suite runner
 */
function createMockTestClient(
  mockCallTool: (name: string, args: unknown) => Promise<ToolResult>
): TestClient {
  return {
    raw: {} as TestClient["raw"],
    callTool: mockCallTool,
    listTools: vi.fn().mockResolvedValue([]),
    listResources: vi.fn().mockResolvedValue([]),
    readResource: vi.fn().mockResolvedValue({ contents: [] }),
    getCallHistory: vi.fn().mockReturnValue([]),
    clearHistory: vi.fn(),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };
}

describe("Behavior Testing Integration", () => {
  describe("defineTestSuite", () => {
    it("should define a test suite with all properties", () => {
      const beforeEach = vi.fn();
      const afterEach = vi.fn();

      const suite = defineTestSuite({
        name: "integration test",
        tool: "greet",
        cases: [
          { name: "test case 1", input: { name: "Alice" } },
          { name: "test case 2", input: { name: "Bob" }, expected: { greeting: "Hello, Bob!" } },
        ],
        beforeEach,
        afterEach,
      });

      expect(suite.name).toBe("integration test");
      expect(suite.tool).toBe("greet");
      expect(suite.cases).toHaveLength(2);
      expect(suite.beforeEach).toBe(beforeEach);
      expect(suite.afterEach).toBe(afterEach);
    });

    it("should throw if no cases provided", () => {
      expect(() =>
        defineTestSuite({
          name: "empty suite",
          tool: "greet",
          cases: [],
        })
      ).toThrow("must have at least one test case");
    });

    it("should throw if case has no name", () => {
      expect(() =>
        defineTestSuite({
          name: "invalid suite",
          tool: "greet",
          cases: [{ name: "", input: {} }],
        })
      ).toThrow("must have a name");
    });
  });

  describe("runTestSuite", () => {
    it("should run a test suite and return results", async () => {
      const mockCallTool = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: '{"message":"Hello, Alice!"}' }],
        isError: false,
        structuredContent: { message: "Hello, Alice!" },
      });

      const client = createMockTestClient(mockCallTool);

      const suite = defineTestSuite({
        name: "greet suite",
        tool: "greet",
        cases: [
          {
            name: "greets Alice",
            input: { name: "Alice" },
            expected: { message: "Hello, Alice!" },
          },
        ],
      });

      const results = await runTestSuite(client, suite);

      expect(results.name).toBe("greet suite");
      expect(results.total).toBe(1);
      expect(results.passed).toBe(1);
      expect(results.failed).toBe(0);
      expect(results.skipped).toBe(0);
      expect(results.cases[0]?.status).toBe("passed");
      expect(mockCallTool).toHaveBeenCalledWith("greet", { name: "Alice" });
    });

    it("should handle test suite with multiple cases", async () => {
      let callCount = 0;
      const mockCallTool = vi.fn().mockImplementation((name: string, args: unknown) => {
        callCount++;
        const input = args as { name: string };
        return Promise.resolve({
          content: [{ type: "text", text: `{"message":"Hello, ${input.name}!"}` }],
          isError: false,
          structuredContent: { message: `Hello, ${input.name}!` },
        });
      });

      const client = createMockTestClient(mockCallTool);

      const suite = defineTestSuite({
        name: "multi-case suite",
        tool: "greet",
        cases: [
          {
            name: "greets Alice",
            input: { name: "Alice" },
            expected: { message: "Hello, Alice!" },
          },
          { name: "greets Bob", input: { name: "Bob" }, expected: { message: "Hello, Bob!" } },
          {
            name: "greets Charlie",
            input: { name: "Charlie" },
            expected: { message: "Hello, Charlie!" },
          },
        ],
      });

      const results = await runTestSuite(client, suite);

      expect(results.total).toBe(3);
      expect(results.passed).toBe(3);
      expect(results.failed).toBe(0);
      expect(mockCallTool).toHaveBeenCalledTimes(3);
    });

    it("should respect skip flag", async () => {
      const mockCallTool = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: '{"message":"Hello!"}' }],
        isError: false,
        structuredContent: { message: "Hello!" },
      });

      const client = createMockTestClient(mockCallTool);

      const suite = defineTestSuite({
        name: "skip test suite",
        tool: "greet",
        cases: [
          { name: "runs this", input: { name: "Alice" } },
          { name: "skips this", input: { name: "Bob" }, skip: true },
          { name: "also runs", input: { name: "Charlie" } },
        ],
      });

      const results = await runTestSuite(client, suite);

      expect(results.total).toBe(3);
      expect(results.passed).toBe(2);
      expect(results.skipped).toBe(1);
      expect(results.cases[1]?.status).toBe("skipped");
      expect(mockCallTool).toHaveBeenCalledTimes(2);
    });

    it("should respect only flag", async () => {
      const mockCallTool = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: '{"message":"Hello!"}' }],
        isError: false,
        structuredContent: { message: "Hello!" },
      });

      const client = createMockTestClient(mockCallTool);

      const suite = defineTestSuite({
        name: "only test suite",
        tool: "greet",
        cases: [
          { name: "not run", input: { name: "Alice" } },
          { name: "only this runs", input: { name: "Bob" }, only: true },
          { name: "also not run", input: { name: "Charlie" } },
        ],
      });

      const results = await runTestSuite(client, suite);

      // Only the "only" case should be counted in total
      expect(results.total).toBe(1);
      expect(results.passed).toBe(1);
      expect(mockCallTool).toHaveBeenCalledTimes(1);
      expect(mockCallTool).toHaveBeenCalledWith("greet", { name: "Bob" });
    });

    it("should handle expected errors", async () => {
      const mockCallTool = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "VALIDATION_ERROR: Invalid input" }],
        isError: true,
      });

      const client = createMockTestClient(mockCallTool);

      const suite = defineTestSuite({
        name: "error suite",
        tool: "validate",
        cases: [
          {
            name: "expects validation error",
            input: { data: null },
            expectError: { code: "VALIDATION_ERROR" },
          },
        ],
      });

      const results = await runTestSuite(client, suite);

      expect(results.passed).toBe(1);
      expect(results.failed).toBe(0);
    });

    it("should call beforeEach and afterEach hooks", async () => {
      const beforeEach = vi.fn();
      const afterEach = vi.fn();

      const mockCallTool = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: '{"ok":true}' }],
        isError: false,
      });

      const client = createMockTestClient(mockCallTool);

      const suite = defineTestSuite({
        name: "hooks suite",
        tool: "test",
        cases: [
          { name: "case 1", input: {} },
          { name: "case 2", input: {} },
        ],
        beforeEach,
        afterEach,
      });

      await runTestSuite(client, suite);

      expect(beforeEach).toHaveBeenCalledTimes(2);
      expect(afterEach).toHaveBeenCalledTimes(2);
    });
  });

  describe("expectToolResult", () => {
    it("should pass for successful result with matching data", () => {
      const result: ToolResult = {
        content: [{ type: "text", text: '{"message":"Hello!"}' }],
        isError: false,
        structuredContent: { message: "Hello!" },
      };

      expect(() => {
        expectToolResult(result).toHaveNoError();
        expectToolResult(result).toMatchObject({ message: "Hello!" });
      }).not.toThrow();
    });

    it("should fail for error result when expecting success", () => {
      const result: ToolResult = {
        content: [{ type: "text", text: "Something went wrong" }],
        isError: true,
      };

      expect(() => {
        expectToolResult(result).toHaveNoError();
      }).toThrow();
    });

    it("should pass for error result when expecting error", () => {
      const result: ToolResult = {
        content: [{ type: "text", text: "ERROR_CODE: Something failed" }],
        isError: true,
      };

      expect(() => {
        expectToolResult(result).toHaveError();
        expectToolResult(result).toHaveError("ERROR_CODE");
      }).not.toThrow();
    });

    it("should check text content with toContainText", () => {
      const result: ToolResult = {
        content: [{ type: "text", text: "Hello, world! This is a greeting." }],
        isError: false,
      };

      expect(() => {
        expectToolResult(result).toContainText("Hello");
        expectToolResult(result).toContainText("greeting");
      }).not.toThrow();

      expect(() => {
        expectToolResult(result).toContainText("goodbye");
      }).toThrow();
    });
  });
});
