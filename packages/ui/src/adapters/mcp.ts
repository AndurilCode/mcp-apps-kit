/**
 * MCP Apps adapter for Claude Desktop
 *
 * Implements the ProtocolAdapter interface for MCP Apps running in Claude Desktop.
 * Uses postMessage for iframe communication.
 */

import type { ProtocolAdapter } from "./types";
import type { HostContext, ResourceContent } from "../types";

/**
 * Adapter for MCP Apps (Claude Desktop)
 *
 * Communicates with the host via postMessage through iframe boundary.
 * State management is a graceful no-op (not supported in MCP Apps).
 */
export class McpAdapter implements ProtocolAdapter {
  private connected = false;
  private context: HostContext;
  private toolResultHandlers: Set<(result: unknown) => void> = new Set();
  private toolInputHandlers: Set<(input: unknown) => void> = new Set();
  private toolCancelledHandlers: Set<(reason?: string) => void> = new Set();
  private hostContextHandlers: Set<(context: HostContext) => void> = new Set();
  private teardownHandlers: Set<(reason?: string) => void> = new Set();
  private currentToolInput?: Record<string, unknown>;
  private currentToolOutput?: Record<string, unknown>;
  private currentToolMeta?: Record<string, unknown>;
  private messageHandler?: (event: MessageEvent) => void;
  private pendingCalls: Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }> = new Map();
  private callId = 0;

  constructor() {
    this.context = this.createDefaultContext();
  }

  private createDefaultContext(): HostContext {
    const isBrowser = typeof window !== "undefined";

    return {
      theme: "light",
      displayMode: "inline",
      availableDisplayModes: ["inline", "fullscreen"],
      viewport: {
        width: isBrowser ? window.innerWidth : 800,
        height: isBrowser ? window.innerHeight : 600,
      },
      locale: isBrowser ? navigator.language : "en-US",
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      platform: "desktop",
    };
  }

  // === Lifecycle ===

  async connect(): Promise<void> {
    if (typeof window === "undefined") {
      this.connected = true;
      return;
    }

    // Set up message handler
    this.messageHandler = this.handleMessage.bind(this);
    window.addEventListener("message", this.messageHandler);

    this.connected = true;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private handleMessage(event: MessageEvent): void {
    // Verify origin if needed
    const data = event.data as { type?: string; id?: string; result?: unknown; error?: string; context?: HostContext; input?: Record<string, unknown>; output?: Record<string, unknown>; reason?: string };

    switch (data.type) {
      case "mcp:response":
        this.handleResponse(data);
        break;
      case "mcp:context":
        if (data.context) {
          this.context = data.context;
          for (const handler of this.hostContextHandlers) {
            handler(this.context);
          }
        }
        break;
      case "mcp:toolResult":
        this.currentToolOutput = data.output;
        for (const handler of this.toolResultHandlers) {
          handler(data.output);
        }
        break;
      case "mcp:toolInput":
        this.currentToolInput = data.input;
        for (const handler of this.toolInputHandlers) {
          handler(data.input);
        }
        break;
      case "mcp:cancelled":
        for (const handler of this.toolCancelledHandlers) {
          handler(data.reason);
        }
        break;
      case "mcp:teardown":
        for (const handler of this.teardownHandlers) {
          handler(data.reason);
        }
        break;
    }
  }

  private handleResponse(data: { id?: string; result?: unknown; error?: string }): void {
    if (!data.id) return;
    const pending = this.pendingCalls.get(data.id);
    if (!pending) return;

    this.pendingCalls.delete(data.id);
    if (data.error) {
      pending.reject(new Error(data.error));
    } else {
      pending.resolve(data.result);
    }
  }

  private sendToHost(message: Record<string, unknown>): void {
    if (typeof window !== "undefined" && window.parent !== window) {
      window.parent.postMessage(message, "*");
    }
  }

  private callHost(method: string, params: Record<string, unknown>): Promise<unknown> {
    this.callId += 1;
    const id = `mcp:${String(this.callId)}`;
    return new Promise((resolve, reject) => {
      this.pendingCalls.set(id, { resolve, reject });
      this.sendToHost({ type: "mcp:request", id, method, params });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingCalls.has(id)) {
          this.pendingCalls.delete(id);
          reject(new Error(`MCP call "${method}" timed out`));
        }
      }, 30000);
    });
  }

  // === Tool Operations ===

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.callHost("callTool", { name, args });
  }

  // === Messaging ===

  async sendMessage(content: { type: string; text: string }): Promise<void> {
    await this.callHost("sendMessage", { content });
  }

  // === Navigation ===

  async openLink(url: string): Promise<void> {
    await this.callHost("openLink", { url });
  }

  async requestDisplayMode(mode: string): Promise<{ mode: string }> {
    const result = await this.callHost("requestDisplayMode", { mode });
    return result as { mode: string };
  }

  requestClose(): void {
    this.sendToHost({ type: "mcp:close" });
  }

  // === State (Graceful No-Op for MCP Apps) ===

  getState<S>(): S | null {
    // MCP Apps doesn't support persistent state
    return null;
  }

  setState<S>(_state: S): void {
    // MCP Apps doesn't support persistent state - silent no-op
  }

  // === Resources ===

  async readResource(uri: string): Promise<{ contents: ResourceContent[] }> {
    const result = await this.callHost("readResource", { uri });
    return result as { contents: ResourceContent[] };
  }

  // === Logging ===

  log(level: string, data: unknown): void {
    const logFn = {
      debug: console.debug,
      info: console.info,
      warning: console.warn,
      error: console.error,
    }[level] ?? console.log;

    logFn("[MCP Apps]", data);
  }

  // === Events ===

  onToolResult(handler: (result: unknown) => void): () => void {
    this.toolResultHandlers.add(handler);
    return () => this.toolResultHandlers.delete(handler);
  }

  onToolInput(handler: (input: unknown) => void): () => void {
    this.toolInputHandlers.add(handler);
    return () => this.toolInputHandlers.delete(handler);
  }

  onToolCancelled(handler: (reason?: string) => void): () => void {
    this.toolCancelledHandlers.add(handler);
    return () => this.toolCancelledHandlers.delete(handler);
  }

  onHostContextChange(handler: (context: HostContext) => void): () => void {
    this.hostContextHandlers.add(handler);
    return () => this.hostContextHandlers.delete(handler);
  }

  onTeardown(handler: (reason?: string) => void): () => void {
    this.teardownHandlers.add(handler);
    return () => this.teardownHandlers.delete(handler);
  }

  // === Accessors ===

  getHostContext(): HostContext {
    return this.context;
  }

  getToolInput(): Record<string, unknown> | undefined {
    return this.currentToolInput;
  }

  getToolOutput(): Record<string, unknown> | undefined {
    return this.currentToolOutput;
  }

  getToolMeta(): Record<string, unknown> | undefined {
    return this.currentToolMeta;
  }
}
