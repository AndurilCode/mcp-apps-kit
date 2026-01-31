/**
 * Tests for run_test_suite tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConnectionManager } from "../src/connection";
import { createRunTestSuiteTool } from "../src/tools/test-suite";

vi.mock("@mcp-apps-kit/testing", () => {
  const listTools = vi.fn();
  const listResources = vi.fn();
  const listPrompts = vi.fn();
  const runTestSuite = vi.fn();
  const defineTestSuite = vi.fn((config: unknown) => config);

  return {
    createTestClient: vi.fn().mockImplementation(() =>
      Promise.resolve({
        listTools,
        listResources,
        listPrompts,
        callTool: vi.fn(),
        disconnect: vi.fn(),
        getCallHistory: vi.fn().mockReturnValue([]),
        clearHistory: vi.fn(),
        raw: {},
      })
    ),
    defineTestSuite,
    runTestSuite,
    __mocks: { listTools, listResources, listPrompts, runTestSuite, defineTestSuite },
  };
});

import * as testingModule from "@mcp-apps-kit/testing";
import { createMockRegistry } from "./test-utils";

interface MocksType {
  listTools: ReturnType<typeof vi.fn>;
  listResources: ReturnType<typeof vi.fn>;
  listPrompts: ReturnType<typeof vi.fn>;
  runTestSuite: ReturnType<typeof vi.fn>;
  defineTestSuite: ReturnType<typeof vi.fn>;
}

const mocks = (testingModule as unknown as { __mocks: MocksType }).__mocks;

describe("run_test_suite Tool", () => {
  let manager: ConnectionManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    manager = new ConnectionManager();

    mocks.listTools.mockResolvedValue([{ name: "greet" }]);
    mocks.listResources.mockResolvedValue([]);
    mocks.listPrompts.mockResolvedValue([]);

    await manager.connect({ transport: "http", url: "http://localhost:3000/mcp" });
  });

  afterEach(async () => {
    await manager.disconnect();
  });

  it("should run a test suite and return results", async () => {
    mocks.runTestSuite.mockResolvedValue({
      name: "Greet Tests",
      passed: 2,
      failed: 0,
      skipped: 1,
      total: 3,
      duration: 150,
      cases: [
        {
          name: "should greet Alice",
          status: "passed",
          duration: 50,
          actual: { message: "Hello Alice" },
          expected: { message: "Hello Alice" },
        },
        {
          name: "should greet Bob",
          status: "passed",
          duration: 45,
          actual: { message: "Hello Bob" },
          expected: { message: "Hello Bob" },
        },
        {
          name: "skipped test",
          status: "skipped",
          duration: 0,
        },
      ],
    });

    const tool = createRunTestSuiteTool(createMockRegistry(manager));
    const result = await tool.handler(
      {
        suite: {
          name: "Greet Tests",
          tool: "greet",
          cases: [
            {
              name: "should greet Alice",
              input: { name: "Alice" },
              expected: { message: "Hello Alice" },
            },
            {
              name: "should greet Bob",
              input: { name: "Bob" },
              expected: { message: "Hello Bob" },
            },
            { name: "skipped test", input: {}, skip: true },
          ],
        },
      },
      {} as never
    );

    expect(result.suiteName).toBe("Greet Tests");
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.total).toBe(3);
    expect(result.duration).toBe(150);
    expect(result.results).toHaveLength(3);
    expect(result.results[0]?.status).toBe("passed");
    expect(result.results[2]?.status).toBe("skipped");
  });

  it("should handle failed test cases", async () => {
    mocks.runTestSuite.mockResolvedValue({
      name: "Greet Tests",
      passed: 0,
      failed: 1,
      skipped: 0,
      total: 1,
      duration: 100,
      cases: [
        {
          name: "should fail",
          status: "failed",
          duration: 100,
          error: { message: "Expected Hello but got Goodbye" },
          actual: { message: "Goodbye" },
          expected: { message: "Hello" },
        },
      ],
    });

    const tool = createRunTestSuiteTool(createMockRegistry(manager));
    const result = await tool.handler(
      {
        suite: {
          name: "Greet Tests",
          tool: "greet",
          cases: [{ name: "should fail", input: {}, expected: { message: "Hello" } }],
        },
      },
      {} as never
    );

    expect(result.failed).toBe(1);
    expect(result.results[0]?.status).toBe("failed");
    expect(result.results[0]?.error).toBe("Expected Hello but got Goodbye");
    expect(result.results[0]?.actual).toEqual({ message: "Goodbye" });
    expect(result.results[0]?.expected).toEqual({ message: "Hello" });
  });

  it("should pass suite config to defineTestSuite", async () => {
    mocks.runTestSuite.mockResolvedValue({
      name: "Test",
      passed: 1,
      failed: 0,
      skipped: 0,
      total: 1,
      duration: 50,
      cases: [{ name: "case1", status: "passed", duration: 50 }],
    });

    const tool = createRunTestSuiteTool(createMockRegistry(manager));
    await tool.handler(
      {
        suite: {
          name: "My Suite",
          tool: "my_tool",
          cases: [
            { name: "case1", input: { foo: "bar" }, expected: { result: true }, skip: false },
          ],
        },
      },
      {} as never
    );

    expect(mocks.defineTestSuite).toHaveBeenCalledWith({
      name: "My Suite",
      tool: "my_tool",
      cases: [{ name: "case1", input: { foo: "bar" }, expected: { result: true }, skip: false }],
    });
  });

  it("should throw error when not connected", async () => {
    const disconnectedManager = new ConnectionManager();
    const tool = createRunTestSuiteTool(createMockRegistry(disconnectedManager));

    await expect(
      tool.handler(
        {
          suite: {
            name: "Test",
            tool: "greet",
            cases: [{ name: "case1", input: {} }],
          },
        },
        {} as never
      )
    ).rejects.toThrow("No active connection");
  });

  it("should have correct metadata", () => {
    const tool = createRunTestSuiteTool(createMockRegistry(manager));
    expect(tool.description).toContain("Run a test suite against a tool");
  });
});
