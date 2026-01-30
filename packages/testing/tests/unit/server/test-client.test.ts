/**
 * Unit tests for TestClient
 *
 * These tests verify the behavior of test client utilities.
 * Integration tests with actual MCP servers are in the contract tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConnectionError } from "../../../src/errors";

// Track what StdioClientTransport receives
let lastStdioArgs: unknown = null;
let lastHttpArgs: unknown = null;
let connectShouldFail = false;
let lastOnclose: (() => void) | null = null;

// Mock the MCP SDK modules
vi.mock("@modelcontextprotocol/sdk/client/index.js", () => {
  return {
    Client: class MockClient {
      async connect() {
        if (connectShouldFail) {
          throw new Error("Connection refused");
        }
      }
      async request() {
        return { content: [] };
      }
      async listTools() {
        return { tools: [] };
      }
      async listResources() {
        return { resources: [] };
      }
      async listPrompts() {
        return { prompts: [] };
      }
      async getPrompt() {
        return { messages: [] };
      }
      async readResource() {
        return { contents: [] };
      }
    },
  };
});

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => {
  return {
    StreamableHTTPClientTransport: class MockHTTP {
      onclose: (() => void) | null = null;
      constructor(url: unknown) {
        lastHttpArgs = url;
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        setTimeout(() => {
          lastOnclose = self.onclose;
        }, 0);
      }
      async close() {}
    },
  };
});

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => {
  return {
    StdioClientTransport: class MockStdio {
      onclose: (() => void) | null = null;
      constructor(args: unknown) {
        lastStdioArgs = args;
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        setTimeout(() => {
          lastOnclose = self.onclose;
        }, 0);
      }
      async close() {}
    },
  };
});

vi.mock("@modelcontextprotocol/sdk/types.js", () => ({
  CallToolResultSchema: {},
}));

beforeEach(() => {
  lastStdioArgs = null;
  lastHttpArgs = null;
  connectShouldFail = false;
  lastOnclose = null;
});

// Import after mocks are set up
const { createTestClient } = await import("../../../src/server/test-client");

describe("createTestClient", () => {
  describe("HTTP transport", () => {
    it("should create an HTTP transport with URL", async () => {
      const client = await createTestClient({
        transport: "http",
        url: "http://localhost:3000/mcp",
      });
      expect(client).toBeDefined();
      expect(lastHttpArgs).toBeInstanceOf(URL);
      expect((lastHttpArgs as URL).href).toBe("http://localhost:3000/mcp");
    });

    it("should wire onTransportClose for HTTP", async () => {
      const onClose = vi.fn();
      await createTestClient(
        { transport: "http", url: "http://localhost:3000/mcp" },
        { onTransportClose: onClose }
      );
      // Give time for the setTimeout in mock to fire
      await new Promise((r) => setTimeout(r, 10));
      expect(lastOnclose).toBe(onClose);
    });
  });

  describe("stdio transport", () => {
    it("should create a stdio transport with command and args", async () => {
      await createTestClient({
        transport: "stdio",
        command: "node",
        args: ["server.js"],
      });
      expect(lastStdioArgs).toEqual({
        command: "node",
        args: ["server.js"],
        env: undefined,
        cwd: undefined,
        stderr: "pipe",
      });
    });

    it("should create a stdio transport without args", async () => {
      await createTestClient({
        transport: "stdio",
        command: "python3",
      });
      expect(lastStdioArgs).toEqual({
        command: "python3",
        args: undefined,
        env: undefined,
        cwd: undefined,
        stderr: "pipe",
      });
    });

    it("should merge env with process.env when env is provided", async () => {
      await createTestClient({
        transport: "stdio",
        command: "node",
        env: { MY_VAR: "test" },
      });
      const args = lastStdioArgs as { env: Record<string, string> };
      expect(args.env).toBeDefined();
      expect(args.env.MY_VAR).toBe("test");
      // Should contain process.env vars too
      if (process.env.PATH) {
        expect(args.env.PATH).toBe(process.env.PATH);
      }
    });

    it("should not set env when env is not provided", async () => {
      await createTestClient({
        transport: "stdio",
        command: "node",
      });
      const args = lastStdioArgs as { env: undefined };
      expect(args.env).toBeUndefined();
    });

    it("should pass cwd to stdio transport", async () => {
      await createTestClient({
        transport: "stdio",
        command: "node",
        cwd: "/tmp/test",
      });
      const args = lastStdioArgs as { cwd: string };
      expect(args.cwd).toBe("/tmp/test");
    });

    it("should wire onTransportClose for stdio", async () => {
      const onClose = vi.fn();
      await createTestClient(
        { transport: "stdio", command: "node" },
        { onTransportClose: onClose }
      );
      await new Promise((r) => setTimeout(r, 10));
      expect(lastOnclose).toBe(onClose);
    });
  });

  describe("connection errors", () => {
    it("should throw ConnectionError on HTTP connect failure", async () => {
      connectShouldFail = true;
      await expect(
        createTestClient({ transport: "http", url: "http://localhost:59999/mcp" })
      ).rejects.toThrow(ConnectionError);
    });

    it("should throw ConnectionError on stdio connect failure", async () => {
      connectShouldFail = true;
      await expect(
        createTestClient({ transport: "stdio", command: "nonexistent" })
      ).rejects.toThrow(ConnectionError);
    });

    it("should include stdio label in ConnectionError", async () => {
      connectShouldFail = true;
      try {
        await createTestClient({
          transport: "stdio",
          command: "node",
          args: ["server.js"],
        });
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ConnectionError);
        expect((e as ConnectionError).url).toBe("stdio: node server.js");
      }
    });

    it("should include HTTP URL in ConnectionError", async () => {
      connectShouldFail = true;
      try {
        await createTestClient({
          transport: "http",
          url: "http://localhost:59999/mcp",
        });
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ConnectionError);
        expect((e as ConnectionError).url).toBe("http://localhost:59999/mcp");
      }
    });
  });

  describe("client operations", () => {
    it("should list tools", async () => {
      const client = await createTestClient({
        transport: "http",
        url: "http://localhost:3000/mcp",
      });
      const tools = await client.listTools();
      expect(Array.isArray(tools)).toBe(true);
    });

    it("should list resources", async () => {
      const client = await createTestClient({
        transport: "http",
        url: "http://localhost:3000/mcp",
      });
      const resources = await client.listResources();
      expect(Array.isArray(resources)).toBe(true);
    });

    it("should list prompts", async () => {
      const client = await createTestClient({
        transport: "http",
        url: "http://localhost:3000/mcp",
      });
      const prompts = await client.listPrompts();
      expect(Array.isArray(prompts)).toBe(true);
    });

    it("should call tools", async () => {
      const client = await createTestClient({
        transport: "http",
        url: "http://localhost:3000/mcp",
      });
      const result = await client.callTool("test", {});
      expect(result).toBeDefined();
      expect(result.content).toEqual([]);
    });

    it("should track call history when enabled", async () => {
      const client = await createTestClient(
        { transport: "http", url: "http://localhost:3000/mcp" },
        { trackHistory: true }
      );
      await client.callTool("test", { key: "val" });
      const history = client.getCallHistory();
      expect(history.length).toBe(1);
      expect(history[0].name).toBe("test");
      expect(history[0].args).toEqual({ key: "val" });
      expect(history[0].duration).toBeGreaterThanOrEqual(0);
    });

    it("should not track history by default", async () => {
      const client = await createTestClient({
        transport: "http",
        url: "http://localhost:3000/mcp",
      });
      await client.callTool("test", {});
      expect(client.getCallHistory().length).toBe(0);
    });

    it("should clear call history", async () => {
      const client = await createTestClient(
        { transport: "http", url: "http://localhost:3000/mcp" },
        { trackHistory: true }
      );
      await client.callTool("test", {});
      expect(client.getCallHistory().length).toBe(1);
      client.clearHistory();
      expect(client.getCallHistory().length).toBe(0);
    });

    it("should disconnect", async () => {
      const client = await createTestClient({
        transport: "http",
        url: "http://localhost:3000/mcp",
      });
      await expect(client.disconnect()).resolves.toBeUndefined();
    });
  });

  describe("options", () => {
    it("should accept trackHistory option", () => {
      const options = { trackHistory: true };
      expect(options.trackHistory).toBe(true);
    });

    it("should accept timeout option", () => {
      const options = { timeout: 5000 };
      expect(options.timeout).toBe(5000);
    });

    it("should accept retries option", () => {
      const options = { retries: 3 };
      expect(options.retries).toBe(3);
    });

    it("should have default timeout of 30000ms", () => {
      const defaultOptions = { timeout: 30000 };
      expect(defaultOptions.timeout).toBe(30000);
    });
  });
});
