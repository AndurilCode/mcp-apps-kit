/**
 * OpenAI/ChatGPT Apps adapter
 *
 * Implements the ProtocolAdapter interface for ChatGPT Apps.
 * Would integrate with the OpenAI Apps SDK when available.
 */

import type { ProtocolAdapter } from "./types";
import type { HostContext, ResourceContent } from "../types";

/**
 * Adapter for ChatGPT Apps (OpenAI)
 *
 * Supports session-scoped state persistence.
 * Integrates with the OpenAI Apps SDK.
 */
export class OpenAIAdapter implements ProtocolAdapter {
  private connected = false;
  private context: HostContext;
  private state: unknown = null;
  private toolResultHandlers: Set<(result: unknown) => void> = new Set();
  private toolInputHandlers: Set<(input: unknown) => void> = new Set();
  private toolCancelledHandlers: Set<(reason?: string) => void> = new Set();
  private hostContextHandlers: Set<(context: HostContext) => void> = new Set();
  private teardownHandlers: Set<(reason?: string) => void> = new Set();
  private currentToolInput?: Record<string, unknown>;
  private currentToolOutput?: Record<string, unknown>;
  private currentToolMeta?: Record<string, unknown>;

  constructor() {
    this.context = this.createDefaultContext();
  }

  private createDefaultContext(): HostContext {
    const isBrowser = typeof window !== "undefined";

    return {
      theme: "light",
      displayMode: "inline",
      availableDisplayModes: ["inline", "fullscreen", "pip"],
      viewport: {
        width: isBrowser ? window.innerWidth : 800,
        height: isBrowser ? window.innerHeight : 600,
      },
      locale: isBrowser ? navigator.language : "en-US",
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      platform: "web",
      deviceCapabilities: {
        touch: isBrowser ? "ontouchstart" in window : false,
        hover: true,
      },
    };
  }

  private getOpenAI(): { [key: string]: unknown } | null {
    if (typeof window !== "undefined" && "openai" in window) {
      return (window as { openai: { [key: string]: unknown } }).openai;
    }
    return null;
  }

  // === Lifecycle ===

  async connect(): Promise<void> {
    // In a real implementation, we would initialize the OpenAI Apps SDK here
    const openai = this.getOpenAI();
    if (openai && typeof openai.init === "function") {
      await (openai.init as () => Promise<void>)();
    }
    this.connected = true;
  }

  isConnected(): boolean {
    return this.connected;
  }

  // === Tool Operations ===

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const openai = this.getOpenAI();
    if (openai && typeof openai.callTool === "function") {
      return (openai.callTool as (name: string, args: Record<string, unknown>) => Promise<unknown>)(name, args);
    }
    throw new Error("OpenAI SDK not available");
  }

  // === Messaging ===

  async sendMessage(content: { type: string; text: string }): Promise<void> {
    const openai = this.getOpenAI();
    if (openai && typeof openai.sendMessage === "function") {
      await (openai.sendMessage as (content: { type: string; text: string }) => Promise<void>)(content);
    }
  }

  // === Navigation ===

  async openLink(url: string): Promise<void> {
    const openai = this.getOpenAI();
    if (openai && typeof openai.openLink === "function") {
      await (openai.openLink as (url: string) => Promise<void>)(url);
    } else {
      // Fallback
      window.open(url, "_blank");
    }
  }

  async requestDisplayMode(mode: string): Promise<{ mode: string }> {
    const openai = this.getOpenAI();
    if (openai && typeof openai.requestDisplayMode === "function") {
      return (openai.requestDisplayMode as (mode: string) => Promise<{ mode: string }>)(mode);
    }
    // Fallback: just return the requested mode
    this.context = { ...this.context, displayMode: mode as HostContext["displayMode"] };
    return { mode };
  }

  requestClose(): void {
    const openai = this.getOpenAI();
    if (openai && typeof openai.close === "function") {
      (openai.close as () => void)();
    }
  }

  // === State (Supported in ChatGPT) ===

  getState<S>(): S | null {
    return this.state as S | null;
  }

  setState<S>(state: S): void {
    this.state = state;
    const openai = this.getOpenAI();
    if (openai && typeof openai.setState === "function") {
      (openai.setState as (state: S) => void)(state);
    }
  }

  // === Files (ChatGPT Specific) ===

  async uploadFile(file: File): Promise<{ fileId: string }> {
    const openai = this.getOpenAI();
    if (openai && typeof openai.uploadFile === "function") {
      return (openai.uploadFile as (file: File) => Promise<{ fileId: string }>)(file);
    }
    throw new Error("File upload not supported");
  }

  async getFileDownloadUrl(fileId: string): Promise<{ downloadUrl: string }> {
    const openai = this.getOpenAI();
    if (openai && typeof openai.getFileDownloadUrl === "function") {
      return (openai.getFileDownloadUrl as (fileId: string) => Promise<{ downloadUrl: string }>)(fileId);
    }
    throw new Error("File download not supported");
  }

  // === Resources ===

  async readResource(uri: string): Promise<{ contents: ResourceContent[] }> {
    const openai = this.getOpenAI();
    if (openai && typeof openai.readResource === "function") {
      return (openai.readResource as (uri: string) => Promise<{ contents: ResourceContent[] }>)(uri);
    }
    return { contents: [] };
  }

  // === Logging ===

  log(level: string, data: unknown): void {
    const logFn = {
      debug: console.debug,
      info: console.info,
      warning: console.warn,
      error: console.error,
    }[level] ?? console.log;

    logFn("[ChatGPT Apps]", data);
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
