/**
 * Host Emulators tests
 *
 * Tests for MCPHostEmulator and OpenAIHostEmulator
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { MCPHostEmulator } from "../src/hosts/mcp-host";
import { OpenAIHostEmulator } from "../src/hosts/openai-host";

describe("MCPHostEmulator", () => {
  let emulator: MCPHostEmulator;
  let dom: JSDOM;

  beforeEach(() => {
    emulator = new MCPHostEmulator({
      toolName: "test_tool",
      toolResult: { temperature: 72, humidity: 45 },
    });
    dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
      runScripts: "dangerously",
    });
  });

  describe("injectIntoJSDOM", () => {
    it("should mock window.parent.postMessage", () => {
      emulator.injectIntoJSDOM({ window: dom.window as unknown as Window });

      expect(dom.window.parent).toBeDefined();
      expect(typeof dom.window.parent.postMessage).toBe("function");
    });

    it("should emit tool result after injection", async () => {
      const messagesReceived: unknown[] = [];

      dom.window.addEventListener("message", (event: MessageEvent) => {
        messagesReceived.push(event.data);
      });

      emulator.injectIntoJSDOM({ window: dom.window as unknown as Window });

      // Wait for the deferred emission
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should have received hostContext/changed and ui/notifications/tool-result notifications
      const methods = messagesReceived
        .filter((m) => typeof m === "object" && m !== null)
        .map((m) => (m as { method?: string }).method)
        .filter(Boolean);

      expect(methods).toContain("hostContext/changed");
      expect(methods).toContain("ui/notifications/tool-result");
    });
  });

  describe("handlePostMessage", () => {
    it("should respond to ui/initialize request", async () => {
      const responses: unknown[] = [];

      dom.window.addEventListener("message", (event: MessageEvent) => {
        responses.push(event.data);
      });

      emulator.injectIntoJSDOM({ window: dom.window as unknown as Window });

      // Wait for initial emissions
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Send ui/initialize request
      dom.window.parent.postMessage(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "ui/initialize",
          params: {},
        },
        "*"
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Find the initialize response
      const initResponse = responses.find(
        (r) =>
          typeof r === "object" &&
          r !== null &&
          (r as { id?: number }).id === 1 &&
          (r as { result?: unknown }).result !== undefined
      );

      expect(initResponse).toBeDefined();
      const result = (initResponse as { result: { hostCapabilities: unknown } }).result;
      expect(result.hostCapabilities).toBeDefined();
    });

    it("should track tools/call requests", async () => {
      emulator.injectIntoJSDOM({ window: dom.window as unknown as Window });

      // Wait for initial emissions
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Send a tool call
      dom.window.parent.postMessage(
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "get_weather",
            arguments: { city: "London" },
          },
        },
        "*"
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      const history = emulator.getToolCallHistory();
      expect(history).toHaveLength(1);
      expect(history[0]?.name).toBe("get_weather");
      expect(history[0]?.args).toEqual({ city: "London" });
    });

    it("should invoke custom onToolCall handler", async () => {
      const mockOnToolCall = vi.fn().mockResolvedValue({ result: "custom" });
      emulator = new MCPHostEmulator({
        toolName: "test_tool",
        toolResult: {},
        onToolCall: mockOnToolCall,
      });

      emulator.injectIntoJSDOM({ window: dom.window as unknown as Window });
      await new Promise((resolve) => setTimeout(resolve, 50));

      dom.window.parent.postMessage(
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "custom_tool",
            arguments: { x: 1 },
          },
        },
        "*"
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockOnToolCall).toHaveBeenCalledWith("custom_tool", { x: 1 });
    });
  });

  describe("getPlaywrightInitScript", () => {
    it("should generate valid JavaScript", () => {
      const script = emulator.getPlaywrightInitScript();

      expect(script).toContain("window.__mcpHostEmulator");
      expect(script).toContain("toolResult");
      expect(script).toContain("postMessage");
    });

    it("should include tool result in script", () => {
      const script = emulator.getPlaywrightInitScript();

      expect(script).toContain('"temperature"');
      expect(script).toContain("72");
    });
  });

  describe("tool call history", () => {
    it("should track and clear history", async () => {
      emulator.injectIntoJSDOM({ window: dom.window as unknown as Window });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Add some tool calls
      dom.window.parent.postMessage(
        { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "t1", arguments: {} } },
        "*"
      );
      dom.window.parent.postMessage(
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "t2", arguments: {} } },
        "*"
      );

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(emulator.getToolCallHistory()).toHaveLength(2);

      emulator.clearToolCallHistory();
      expect(emulator.getToolCallHistory()).toHaveLength(0);
    });
  });
});

describe("OpenAIHostEmulator", () => {
  let emulator: OpenAIHostEmulator;
  let dom: JSDOM;

  beforeEach(() => {
    emulator = new OpenAIHostEmulator({
      toolName: "weather_tool",
      toolResult: { temp: 68 },
      initialState: { count: 0 },
      theme: "dark",
    });
    dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
      runScripts: "dangerously",
    });
  });

  describe("injectIntoJSDOM", () => {
    it("should create window.openai SDK", () => {
      emulator.injectIntoJSDOM({ window: dom.window as unknown as Window });

      const openai = (dom.window as unknown as { openai: Record<string, unknown> }).openai;
      expect(openai).toBeDefined();
      expect(typeof openai.getToolOutput).toBe("function");
      expect(typeof openai.setState).toBe("function");
      expect(typeof openai.getState).toBe("function");
      expect(typeof openai.callTool).toBe("function");
    });

    it("should set toolOutput as JSON string", () => {
      emulator.injectIntoJSDOM({ window: dom.window as unknown as Window });

      const openai = (dom.window as unknown as { openai: Record<string, unknown> }).openai;
      expect(openai.toolOutput).toBe('{"temp":68}');
    });

    it("should dispatch openai:set_globals event", async () => {
      let receivedEvent: CustomEvent | null = null;

      dom.window.addEventListener("openai:set_globals", (event) => {
        receivedEvent = event as CustomEvent;
      });

      emulator.injectIntoJSDOM({ window: dom.window as unknown as Window });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(receivedEvent).not.toBeNull();
      expect((receivedEvent as CustomEvent).detail.globals.theme).toBe("dark");
    });
  });

  describe("state management", () => {
    it("should track state changes", () => {
      emulator.injectIntoJSDOM({ window: dom.window as unknown as Window });

      const openai = (dom.window as unknown as { openai: Record<string, unknown> }).openai;
      const setState = openai.setState as (state: unknown) => void;

      setState({ count: 1 });
      setState({ count: 2 });

      const changes = emulator.getStateChanges();
      expect(changes).toHaveLength(2);
      expect(changes[0]?.state).toEqual({ count: 1 });
      expect(changes[1]?.state).toEqual({ count: 2 });
    });

    it("should return current state", () => {
      emulator.injectIntoJSDOM({ window: dom.window as unknown as Window });

      const openai = (dom.window as unknown as { openai: Record<string, unknown> }).openai;
      const getState = openai.getState as () => unknown;
      const setState = openai.setState as (state: unknown) => void;

      expect(getState()).toEqual({ count: 0 });

      setState({ count: 5 });
      expect(getState()).toEqual({ count: 5 });
      expect(emulator.getState()).toEqual({ count: 5 });
    });
  });

  describe("tool calls", () => {
    it("should track tool calls", async () => {
      emulator.injectIntoJSDOM({ window: dom.window as unknown as Window });

      const openai = (dom.window as unknown as { openai: Record<string, unknown> }).openai;
      const callTool = openai.callTool as (name: string, args: unknown) => Promise<unknown>;

      await callTool("get_location", { query: "Paris" });
      await callTool("save_data", { data: [1, 2, 3] });

      const calls = emulator.getToolCalls();
      expect(calls).toHaveLength(2);
      expect(calls[0]?.name).toBe("get_location");
      expect(calls[0]?.args).toEqual({ query: "Paris" });
    });

    it("should return mock result from callTool", async () => {
      emulator.injectIntoJSDOM({ window: dom.window as unknown as Window });

      const openai = (dom.window as unknown as { openai: Record<string, unknown> }).openai;
      const callTool = openai.callTool as (
        name: string,
        args: unknown
      ) => Promise<{ output: string }>;

      const result = await callTool("any_tool", {});
      expect(result.output).toBe('{"mock":true}');
    });
  });

  describe("getPlaywrightInitScript", () => {
    it("should generate valid JavaScript", () => {
      const script = emulator.getPlaywrightInitScript();

      expect(script).toContain("window.__openaiEmulator");
      expect(script).toContain("window.openai");
      expect(script).toContain("getToolOutput");
    });

    it("should include configuration in script", () => {
      const script = emulator.getPlaywrightInitScript();

      expect(script).toContain('"temp"');
      expect(script).toContain('"dark"');
    });
  });

  describe("dynamic updates", () => {
    it("should update tool output", () => {
      emulator.injectIntoJSDOM({ window: dom.window as unknown as Window });

      emulator.updateToolOutput(dom.window as unknown as Window, { newData: "updated" });

      const openai = (dom.window as unknown as { openai: Record<string, unknown> }).openai;
      expect(openai.toolOutput).toBe('{"newData":"updated"}');
    });

    it("should update theme and dispatch event", async () => {
      emulator.injectIntoJSDOM({ window: dom.window as unknown as Window });

      // Wait for initial set_globals to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Now track theme changes
      let receivedTheme: string | null = null;
      dom.window.addEventListener("openai:set_globals", (event) => {
        const detail = (event as CustomEvent).detail;
        if (detail.globals.theme) {
          receivedTheme = detail.globals.theme;
        }
      });

      emulator.updateTheme(dom.window as unknown as Window, "light");

      await new Promise((resolve) => setTimeout(resolve, 10));

      const openai = (dom.window as unknown as { openai: Record<string, unknown> }).openai;
      expect(openai.theme).toBe("light");
      expect(receivedTheme).toBe("light");
    });
  });

  describe("history management", () => {
    it("should clear all history", async () => {
      emulator.injectIntoJSDOM({ window: dom.window as unknown as Window });

      const openai = (dom.window as unknown as { openai: Record<string, unknown> }).openai;
      const setState = openai.setState as (state: unknown) => void;
      const callTool = openai.callTool as (name: string, args: unknown) => Promise<unknown>;

      setState({ a: 1 });
      await callTool("tool", {});

      expect(emulator.getStateChanges()).toHaveLength(1);
      expect(emulator.getToolCalls()).toHaveLength(1);

      emulator.clearHistory();

      expect(emulator.getStateChanges()).toHaveLength(0);
      expect(emulator.getToolCalls()).toHaveLength(0);
    });
  });
});
