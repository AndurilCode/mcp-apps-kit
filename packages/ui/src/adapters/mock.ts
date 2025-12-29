/**
 * Mock adapter for development and testing
 *
 * Provides a working implementation without requiring a host platform.
 */

import type { ProtocolAdapter } from "./types";
import type {
  HostContext,
  ResourceContent,
  HostCapabilities,
  HostVersion,
  SizeChangedParams,
  CallToolHandler,
  ListToolsHandler,
} from "../types";

/**
 * Mock adapter for development and testing
 *
 * All operations are simulated locally with console logging.
 */
export class MockAdapter implements ProtocolAdapter {
  private connected = false;
  private state: unknown = null;
  private context: HostContext;
  private toolResultHandlers: Set<(result: unknown) => void> = new Set();
  private toolInputHandlers: Set<(input: unknown) => void> = new Set();
  private toolInputPartialHandlers: Set<(input: unknown) => void> = new Set();
  private toolCancelledHandlers: Set<(reason?: string) => void> = new Set();
  private hostContextHandlers: Set<(context: HostContext) => void> = new Set();
  private teardownHandlers: Set<(reason?: string) => void> = new Set();
  private currentToolInput?: Record<string, unknown>;
  private currentToolOutput?: Record<string, unknown>;
  private currentToolMeta?: Record<string, unknown>;
  private mockHostCapabilities: HostCapabilities = {
    // Common capabilities
    logging: {},
    openLinks: {},
    theming: {
      themes: ["light", "dark", "os"],
    },
    displayModes: {
      modes: ["inline", "fullscreen", "pip", "panel"],
    },
    statePersistence: {
      persistent: true,
    },

    // MCP-specific capabilities
    serverTools: { listChanged: false },
    serverResources: { listChanged: false },
    sizeNotifications: {},
    partialToolInput: {},
    appTools: { listChanged: false },

    // ChatGPT-specific capabilities (for testing cross-platform code)
    fileUpload: {},
    safeAreaInsets: {},
    views: {},
  };
  private mockHostVersion: HostVersion = {
    name: "MockHost",
    version: "1.0.0",
  };
  private callToolHandler?: CallToolHandler;
  private listToolsHandler?: ListToolsHandler;

  constructor() {
    // Create default context
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

  // === Lifecycle ===

  async connect(): Promise<void> {
    this.connected = true;
    // eslint-disable-next-line no-console
    console.log("[MockAdapter] Connected");
  }

  isConnected(): boolean {
    return this.connected;
  }

  // === Tool Operations ===

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    // eslint-disable-next-line no-console
    console.log(`[MockAdapter] callTool("${name}",`, args, ")");

    // Return a mock result
    const result = {
      _mock: true,
      tool: name,
      args,
      timestamp: Date.now(),
    };

    this.currentToolOutput = result;
    return result;
  }

  // === Messaging ===

  async sendMessage(content: { type: string; text: string }): Promise<void> {
    // eslint-disable-next-line no-console
    console.log("[MockAdapter] sendMessage:", content);
  }

  // === Navigation ===

  async openLink(url: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[MockAdapter] openLink("${url}")`);
  }

  async requestDisplayMode(mode: string): Promise<{ mode: string }> {
    // eslint-disable-next-line no-console
    console.log(`[MockAdapter] requestDisplayMode("${mode}")`);
    this.context = { ...this.context, displayMode: mode as HostContext["displayMode"] };
    this.notifyHostContextChange();
    return { mode };
  }

  requestClose(): void {
    // eslint-disable-next-line no-console
    console.log("[MockAdapter] requestClose()");
  }

  // === State ===

  getState<S>(): S | null {
    return this.state as S | null;
  }

  setState<S>(state: S): void {
    this.state = state;
    // eslint-disable-next-line no-console
    console.log("[MockAdapter] setState:", state);
  }

  // === Resources ===

  async readResource(uri: string): Promise<{ contents: ResourceContent[] }> {
    // eslint-disable-next-line no-console
    console.log(`[MockAdapter] readResource("${uri}")`);
    return { contents: [] };
  }

  // === Logging ===

  log(level: string, data: unknown): void {
    // Mock adapter uses console for logging
    const logMapping: Record<string, typeof console.log> = {
      // eslint-disable-next-line no-console
      debug: console.debug,
      // eslint-disable-next-line no-console
      info: console.info,
      // eslint-disable-next-line no-console
      warning: console.warn,
      // eslint-disable-next-line no-console
      error: console.error,
    };
    // eslint-disable-next-line no-console
    const logFn = logMapping[level] ?? console.log;
    logFn("[MockAdapter]", data);
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

  // === Mock-specific Methods ===

  /**
   * Emit a tool result (for testing)
   */
  emitToolResult(result: unknown): void {
    this.currentToolOutput = result as Record<string, unknown>;
    for (const handler of this.toolResultHandlers) {
      handler(result);
    }
  }

  /**
   * Emit a tool input (for testing)
   */
  emitToolInput(input: Record<string, unknown>): void {
    this.currentToolInput = input;
    for (const handler of this.toolInputHandlers) {
      handler(input);
    }
  }

  /**
   * Set host context (for testing)
   */
  setHostContext(context: Partial<HostContext>): void {
    this.context = { ...this.context, ...context };
    this.notifyHostContextChange();
  }

  /**
   * Emit host context change (for testing)
   */
  emitContextChange(context: HostContext): void {
    this.context = context;
    this.notifyHostContextChange();
  }

  /**
   * Set tool input directly (for testing)
   */
  setToolInput(input: Record<string, unknown>): void {
    this.currentToolInput = input;
  }

  /**
   * Emit tool cancelled event (for testing)
   */
  emitToolCancelled(reason?: string): void {
    for (const handler of this.toolCancelledHandlers) {
      handler(reason);
    }
  }

  /**
   * Emit teardown event (for testing)
   */
  emitTeardown(reason?: string): void {
    for (const handler of this.teardownHandlers) {
      handler(reason);
    }
  }

  private notifyHostContextChange(): void {
    for (const handler of this.hostContextHandlers) {
      handler(this.context);
    }
  }

  // === Host Information ===

  getHostCapabilities(): HostCapabilities | undefined {
    return this.mockHostCapabilities;
  }

  getHostVersion(): HostVersion | undefined {
    return this.mockHostVersion;
  }

  // === Protocol-Level Logging ===

  async sendLog(
    level: "debug" | "info" | "notice" | "warning" | "error" | "critical" | "alert" | "emergency",
    data: unknown
  ): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[MockAdapter] sendLog(${level}):`, data);
  }

  // === Size Notifications ===

  async sendSizeChanged(params: SizeChangedParams): Promise<void> {
    // eslint-disable-next-line no-console
    console.log("[MockAdapter] sendSizeChanged:", params);
  }

  // === Partial Tool Input ===

  onToolInputPartial(handler: (input: unknown) => void): () => void {
    this.toolInputPartialHandlers.add(handler);
    return () => this.toolInputPartialHandlers.delete(handler);
  }

  // === Bidirectional Tool Support ===

  setCallToolHandler(handler: CallToolHandler): void {
    this.callToolHandler = handler;
    // eslint-disable-next-line no-console
    console.log("[MockAdapter] setCallToolHandler: handler registered");
  }

  setListToolsHandler(handler: ListToolsHandler): void {
    this.listToolsHandler = handler;
    // eslint-disable-next-line no-console
    console.log("[MockAdapter] setListToolsHandler: handler registered");
  }

  // === Additional Mock-specific Methods ===

  /**
   * Emit partial tool input (for testing streaming input)
   */
  emitToolInputPartial(input: Record<string, unknown>): void {
    for (const handler of this.toolInputPartialHandlers) {
      handler(input);
    }
  }

  /**
   * Set mock host capabilities (for testing)
   */
  setMockHostCapabilities(capabilities: Partial<HostCapabilities>): void {
    this.mockHostCapabilities = { ...this.mockHostCapabilities, ...capabilities };
  }

  /**
   * Set mock host version (for testing)
   */
  setMockHostVersion(version: HostVersion): void {
    this.mockHostVersion = version;
  }

  /**
   * Simulate a tool call from host (for testing bidirectional tools)
   */
  async simulateHostToolCall(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    if (!this.callToolHandler) {
      throw new Error("No call tool handler registered");
    }
    return this.callToolHandler(toolName, args);
  }

  /**
   * Simulate a list tools request from host (for testing bidirectional tools)
   */
  async simulateHostListTools(): Promise<unknown> {
    if (!this.listToolsHandler) {
      return { tools: [] };
    }
    return this.listToolsHandler();
  }
}
