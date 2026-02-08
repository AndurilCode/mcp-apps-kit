/**
 * OpenAI/ChatGPT Apps adapter
 *
 * Implements the ProtocolAdapter interface for ChatGPT Apps.
 * Would integrate with the OpenAI Apps SDK when available.
 *
 * @internal
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
  UpdateModelContextParams,
} from "../types";
import type { DebugTransport, LogEntry } from "../debug/logger";
import { clientDebugLogger } from "../debug/logger";

/**
 * Configuration options for OpenAI adapter logging
 */
export interface OpenAIAdapterLogConfig {
  /**
   * Log transport mechanism.
   * - 'api': Use HTTP endpoint (default)
   * - 'tool': Use the log_debug MCP tool
   * - 'builtin': Not supported for OpenAI, falls back to console
   * @default 'api'
   */
  transport?: DebugTransport;
  /**
   * API endpoint URL for 'api' transport.
   * Required when transport is 'api'.
   */
  apiEndpoint?: string;
}

export class OpenAIAdapter implements ProtocolAdapter {
  private connected = false;
  private context: HostContext;
  private state: unknown = null;
  private toolResultHandlers: Set<(result: unknown) => void> = new Set();
  // Required by ProtocolAdapter interface but not triggered - ChatGPT provides input once at load, not via events
  private toolInputHandlers: Set<(input: unknown) => void> = new Set();
  // Required by ProtocolAdapter interface but not triggered - ChatGPT doesn't emit cancellation events
  private toolCancelledHandlers: Set<(reason?: string) => void> = new Set();
  private hostContextHandlers: Set<(context: HostContext) => void> = new Set();
  // Required by ProtocolAdapter interface but not triggered - ChatGPT doesn't emit teardown events
  private teardownHandlers: Set<(reason?: string) => void> = new Set();
  private currentToolInput?: Record<string, unknown>;
  private currentToolOutput?: Record<string, unknown>;
  // Required by ProtocolAdapter interface (getToolMeta) but ChatGPT doesn't provide tool metadata
  private currentToolMeta?: Record<string, unknown>;
  private globalsHandler?: (event: MessageEvent) => void;

  // Logging configuration
  private logTransport: DebugTransport = "api";
  private logApiEndpoint?: string;
  private apiTransportFailed = false;
  private toolTransportFailed = false;

  constructor() {
    this.context = this.createDefaultContext();
  }

  /**
   * Configure logging transport settings
   *
   * @param config - Logging configuration
   */
  configureLogging(config: OpenAIAdapterLogConfig): void {
    if (config.transport !== undefined) {
      this.logTransport = config.transport;
      // Reset failure states when transport changes
      this.apiTransportFailed = false;
      this.toolTransportFailed = false;
    }
    if (config.apiEndpoint !== undefined) {
      this.logApiEndpoint = config.apiEndpoint;
      // Reset API failure state when endpoint changes
      this.apiTransportFailed = false;
    }
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

  /**
   * Check if a message event data represents an openai:set_globals message.
   * Handles multiple formats for backward compatibility:
   * - String format: "openai:set_globals"
   * - Object with type: { type: "openai:set_globals" }
   * - Object with message: { message: "openai:set_globals" } (older SDK versions)
   */
  private isSetGlobalsMessage(data: unknown): boolean {
    return (
      data === "openai:set_globals" ||
      (typeof data === "object" &&
        data !== null &&
        "type" in data &&
        (data as { type: unknown }).type === "openai:set_globals") ||
      (typeof data === "object" &&
        data !== null &&
        "message" in data &&
        (data as { message: unknown }).message === "openai:set_globals")
    );
  }

  /**
   * Read current context from the OpenAI SDK globals
   * Properties available: theme, displayMode, maxHeight, safeArea, view, userAgent, locale
   */
  private readContextFromSDK(): void {
    const openai = this.getOpenAI();
    if (!openai) return;

    const isBrowser = typeof window !== "undefined";

    // Read theme
    if (typeof openai.theme === "string") {
      this.context.theme = openai.theme as "light" | "dark";
    }

    // Read display mode
    if (typeof openai.displayMode === "string") {
      this.context.displayMode = openai.displayMode as HostContext["displayMode"];
    }

    // Read locale
    if (typeof openai.locale === "string") {
      this.context.locale = openai.locale;
    }

    // Read user agent - store in a type-safe way
    if (typeof openai.userAgent === "string") {
      // Note: userAgent is not part of HostContext type, but we store it for access
      // Apps can access it via (context as any).userAgent if needed
      Object.assign(this.context, { userAgent: openai.userAgent });
    }

    // Read view identifier
    if (typeof openai.view === "string") {
      this.context.view = openai.view;
    }

    // Read safe area insets
    if (openai.safeArea && typeof openai.safeArea === "object") {
      const safeArea = openai.safeArea as Record<string, unknown>;
      this.context.safeAreaInsets = {
        top: typeof safeArea.top === "number" ? safeArea.top : 0,
        right: typeof safeArea.right === "number" ? safeArea.right : 0,
        bottom: typeof safeArea.bottom === "number" ? safeArea.bottom : 0,
        left: typeof safeArea.left === "number" ? safeArea.left : 0,
      };
    }

    // Read max height for viewport
    if (typeof openai.maxHeight === "number") {
      this.context.viewport = {
        width: isBrowser ? window.innerWidth : 800,
        height: openai.maxHeight,
      };
    }

    clientDebugLogger.debug("[OpenAI Adapter] Read context from SDK", this.context);
  }

  /**
   * Notify all registered handlers of context changes
   */
  private notifyContextChange(): void {
    clientDebugLogger.debug(
      `[OpenAI Adapter] Notifying ${String(this.hostContextHandlers.size)} context change handlers`
    );
    // Create a new object reference to trigger React state updates
    const contextSnapshot = { ...this.context };
    for (const handler of this.hostContextHandlers) {
      handler(contextSnapshot);
    }
  }

  private getOpenAI(): { [key: string]: unknown } | null {
    if (typeof window !== "undefined" && "openai" in window) {
      return (window as { openai: { [key: string]: unknown } }).openai;
    }
    return null;
  }

  /**
   * Extract tool name from the OpenAI SDK.
   * The tool name is passed via toolResponseMetadata.toolName from the server.
   */
  private getToolNameFromSDK(): string | undefined {
    const openai = this.getOpenAI();
    if (!openai) return undefined;

    // Primary source: toolResponseMetadata contains toolName
    // This is set by @mcp-apps-kit/core server when returning tool results
    if (openai.toolResponseMetadata && typeof openai.toolResponseMetadata === "object") {
      const meta = openai.toolResponseMetadata as { toolName?: string };
      if (typeof meta.toolName === "string") return meta.toolName;
    }

    // Fallback: try other potential sources
    if (typeof openai.toolName === "string") {
      return openai.toolName;
    }

    return undefined;
  }

  // === Lifecycle ===

  async connect(): Promise<void> {
    // Wait for the OpenAI SDK to be available (injected by ChatGPT sandbox)
    await this.waitForOpenAI();

    const openai = this.getOpenAI();

    // Log available SDK methods for debugging
    if (openai) {
      clientDebugLogger.debug("[OpenAI Adapter] Available SDK methods", Object.keys(openai));

      // Read initial host context from SDK properties
      this.readContextFromSDK();

      // Try to get tool name from SDK
      const toolName = this.getToolNameFromSDK();

      // Try to get initial tool context
      if (typeof openai.getToolOutput === "function") {
        this.currentToolOutput = (openai.getToolOutput as () => Record<string, unknown>)();
        clientDebugLogger.debug("[OpenAI Adapter] Got tool output from SDK");
      } else if (openai.toolOutput) {
        this.currentToolOutput = openai.toolOutput as Record<string, unknown>;
        clientDebugLogger.debug("[OpenAI Adapter] Got tool output from SDK property");
      } else if (openai.result) {
        this.currentToolOutput = openai.result as Record<string, unknown>;
        clientDebugLogger.debug("[OpenAI Adapter] Got result from SDK");
      }

      // Notify handlers of initial tool output (wrapped with tool name)
      if (this.currentToolOutput && Object.keys(this.currentToolOutput).length > 0) {
        const wrappedResult = toolName
          ? { [toolName]: this.currentToolOutput }
          : this.currentToolOutput;
        for (const handler of this.toolResultHandlers) {
          handler(wrappedResult);
        }
      }

      if (typeof openai.getToolInput === "function") {
        this.currentToolInput = (openai.getToolInput as () => Record<string, unknown>)();
      } else if (openai.toolInput) {
        this.currentToolInput = openai.toolInput as Record<string, unknown>;
      } else if (openai.input) {
        this.currentToolInput = openai.input as Record<string, unknown>;
      }

      if (typeof openai.init === "function") {
        await (openai.init as () => Promise<void>)();
      }
    }

    // Subscribe to openai:set_globals events for context and toolOutput updates
    this.setupGlobalsListener();

    this.connected = true;
  }

  /**
   * Custom event handler for openai:set_globals
   */
  private setGlobalsHandler?: (event: Event) => void;

  /**
   * Set up listener for openai:set_globals custom DOM event
   * The host fires these events when global values change (theme, locale, toolOutput, etc.)
   *
   * Handles two formats:
   * - ChatGPT: event.detail.globals.toolOutput (nested under globals)
   * - MCP Inspector: event.detail.toolOutput (flat, no globals wrapper)
   */
  private setupGlobalsListener(): void {
    if (typeof window === "undefined") return;

    this.setGlobalsHandler = (event: Event) => {
      // Type assertion for custom event with detail
      const customEvent = event as CustomEvent<Record<string, unknown>>;
      const detail = customEvent.detail as Record<string, unknown> | undefined;

      if (!detail) {
        // Fallback: re-read from SDK if no detail provided
        this.readContextFromSDK();
        this.checkForToolOutputUpdate();
        return;
      }

      // Handle both formats:
      // - ChatGPT uses event.detail.globals
      // - MCP Inspector uses event.detail directly
      const globals = (detail.globals as Record<string, unknown> | undefined) ?? detail;

      // Track previous values for change detection
      const previousTheme = this.context.theme;
      const previousLocale = this.context.locale;
      const previousDisplayMode = this.context.displayMode;
      const previousToolOutput = this.currentToolOutput;

      // Update context from globals
      if (globals.theme !== undefined) {
        this.context.theme = globals.theme as "light" | "dark";
      }
      if (globals.locale !== undefined) {
        this.context.locale = globals.locale as string;
      }
      if (globals.displayMode !== undefined) {
        this.context.displayMode = globals.displayMode as "inline" | "fullscreen" | "pip";
      }

      // Check if context changed
      if (
        this.context.theme !== previousTheme ||
        this.context.locale !== previousLocale ||
        this.context.displayMode !== previousDisplayMode
      ) {
        clientDebugLogger.debug("[OpenAI Adapter] Context changed, notifying handlers");
        this.notifyContextChange();
      }

      // Handle toolOutput updates
      if (globals.toolOutput !== undefined && globals.toolOutput !== null) {
        const newOutput = globals.toolOutput as Record<string, unknown>;
        if (Object.keys(newOutput).length > 0 && newOutput !== previousToolOutput) {
          clientDebugLogger.debug(
            "[OpenAI Adapter] Got toolOutput from set_globals event",
            newOutput
          );
          this.currentToolOutput = newOutput;

          // Try to get toolName from event metadata or SDK
          let toolName: string | undefined;
          if (
            globals.toolResponseMetadata &&
            typeof globals.toolResponseMetadata === "object" &&
            (globals.toolResponseMetadata as { toolName?: string }).toolName
          ) {
            toolName = (globals.toolResponseMetadata as { toolName?: string }).toolName;
          } else {
            toolName = this.getToolNameFromSDK();
          }

          const wrappedResult = toolName ? { [toolName]: newOutput } : newOutput;
          for (const handler of this.toolResultHandlers) {
            handler(wrappedResult);
          }
        }
      }

      // Handle toolInput updates
      if (globals.toolInput !== undefined) {
        this.currentToolInput = globals.toolInput as Record<string, unknown>;
      }
    };

    // Listen for the custom DOM event (not postMessage!)
    window.addEventListener("openai:set_globals", this.setGlobalsHandler);

    // Also keep the old postMessage listener as fallback for older SDK versions
    this.globalsHandler = (event: MessageEvent) => {
      if (this.isSetGlobalsMessage(event.data)) {
        clientDebugLogger.debug("[OpenAI Adapter] Received set_globals via postMessage (legacy)");
        this.readContextFromSDK();
        this.checkForToolOutputUpdate();
      }
    };

    window.addEventListener("message", this.globalsHandler);
  }

  /**
   * Check if toolOutput has been updated and notify handlers
   */
  private checkForToolOutputUpdate(): void {
    const openai = this.getOpenAI();
    if (!openai) return;

    let newOutput: Record<string, unknown> | undefined;

    if (openai.toolOutput) {
      newOutput = openai.toolOutput as Record<string, unknown>;
    }

    if (newOutput && Object.keys(newOutput).length > 0 && newOutput !== this.currentToolOutput) {
      clientDebugLogger.debug("[OpenAI Adapter] toolOutput updated", newOutput);
      this.currentToolOutput = newOutput;

      const toolName = this.getToolNameFromSDK();
      const wrappedResult = toolName ? { [toolName]: newOutput } : newOutput;
      for (const handler of this.toolResultHandlers) {
        handler(wrappedResult);
      }
    }
  }

  private async waitForOpenAI(timeout = 5000): Promise<void> {
    // If already available, return immediately
    if (this.getOpenAI()) {
      clientDebugLogger.debug("[OpenAI Adapter] window.openai already available");
      return;
    }

    clientDebugLogger.debug("[OpenAI Adapter] Waiting for window.openai...");

    // Wait for the openai global to be injected
    return new Promise((resolve) => {
      const startTime = Date.now();
      let resolved = false;

      const doResolve = () => {
        if (!resolved) {
          resolved = true;
          window.removeEventListener("message", messageHandler);
          resolve();
        }
      };

      const check = () => {
        if (resolved) return;

        if (this.getOpenAI()) {
          clientDebugLogger.debug("[OpenAI Adapter] window.openai found via polling");
          doResolve();
          return;
        }

        if (Date.now() - startTime > timeout) {
          // Timeout - resolve anyway as we might be in a dev/testing environment
          clientDebugLogger.warn(
            "[OpenAI Adapter] window.openai not found after timeout, proceeding anyway"
          );
          doResolve();
          return;
        }

        // Check again in 50ms
        setTimeout(check, 50);
      };

      // Also listen for the set_globals message (various formats)
      const messageHandler = (event: MessageEvent) => {
        if (this.isSetGlobalsMessage(event.data)) {
          clientDebugLogger.debug("[OpenAI Adapter] Received set_globals message");
          // Give a small delay for the globals to be applied, then check
          setTimeout(() => {
            if (this.getOpenAI()) {
              clientDebugLogger.debug("[OpenAI Adapter] window.openai available after set_globals");
              doResolve();
            } else {
              clientDebugLogger.debug(
                "[OpenAI Adapter] window.openai still not available after set_globals, continuing poll"
              );
            }
          }, 50);
        }
      };
      window.addEventListener("message", messageHandler);

      check();
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  // === Tool Operations ===

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const openai = this.getOpenAI();
    if (openai && typeof openai.callTool === "function") {
      return (openai.callTool as (name: string, args: Record<string, unknown>) => Promise<unknown>)(
        name,
        args
      );
    }
    throw new Error("OpenAI SDK not available");
  }

  // === Messaging ===

  async sendMessage(content: { type: string; text: string }): Promise<void> {
    if (content.type !== "text") {
      throw new Error(`Unsupported message content type: ${content.type}`);
    }
    const openai = this.getOpenAI();
    if (openai && typeof openai.sendFollowUpMessage === "function") {
      await (openai.sendFollowUpMessage as (opts: { prompt: string }) => Promise<void>)({
        prompt: content.text,
      });
    }
  }

  // === Model Context ===

  /**
   * Update model context (ext-apps v0.4.0+)
   *
   * On ChatGPT, this method uses setState() internally, which calls the
   * OpenAI SDK's setWidgetState(). In ChatGPT, setWidgetState() exposes
   * data to the AI model context, making it visible to the model.
   *
   * **ChatGPT Implementation Details:**
   * - Uses setState/setWidgetState (exposes to AI + persists for session)
   * - Each call **replaces** the previous context (not accumulated)
   * - Context persists for the widget's session lifetime
   * - Be mindful of data size when sending large structured content
   *
   * **MCP Apps Implementation:**
   * - Pure context update via native protocol feature
   * - No persistence, only sent to model with next user message
   *
   * **Reserved Keys:**
   * - Keys starting with underscore (`_`) in structuredContent are filtered
   * - Internal keys use double-underscore prefix (`__mcp_*`)
   *
   * Use updateModelContext() for context-focused use cases (informing the model
   * about app state), and setState() for persistence-focused use cases.
   * Note: On ChatGPT, both methods expose state to the AI model.
   */
  async updateModelContext(params: UpdateModelContextParams): Promise<void> {
    // Build a context object to send to the model via setState/setWidgetState
    // Use double-underscore prefix for internal keys to avoid collisions with user data
    const modelContext: Record<string, unknown> = {
      __mcp_type: "modelContext",
    };

    // Add structured content, filtering out reserved underscore-prefixed keys
    if (params.structuredContent) {
      const structuredContent = params.structuredContent;
      const reservedKeys = Object.keys(structuredContent).filter((key) => key.startsWith("_"));
      if (reservedKeys.length > 0) {
        clientDebugLogger.debug(
          "[OpenAI Adapter] Filtering reserved keys (underscore-prefixed) from structuredContent:",
          reservedKeys
        );
      }

      // Only merge non-reserved keys (single-underscore prefix is reserved for internal use)
      Object.keys(structuredContent).forEach((key) => {
        if (!key.startsWith("_")) {
          modelContext[key] = structuredContent[key];
        }
      });
    }

    // Convert content blocks to text representation for the model
    // Note: OpenAI adapter only supports text content blocks; other types are dropped
    if (params.content && params.content.length > 0) {
      const textBlocks = params.content.filter((block) => block.type === "text");
      const droppedBlocks = params.content.filter((block) => block.type !== "text");

      if (droppedBlocks.length > 0) {
        clientDebugLogger.debug(
          `[OpenAI Adapter] Dropping ${String(droppedBlocks.length)} non-text content block(s):`,
          droppedBlocks.map((b) => b.type)
        );
      }

      const textContent = textBlocks.map((block) => block.text).join("\n");
      if (textContent) {
        modelContext.__mcp_textContent = textContent;
      }
    }

    // Use existing setState which calls setWidgetState
    this.setState(modelContext);
    clientDebugLogger.debug("[OpenAI Adapter] updateModelContext via setState:", modelContext);
  }

  // === Navigation ===

  async openLink(url: string): Promise<void> {
    const openai = this.getOpenAI();
    if (openai && typeof openai.openExternal === "function") {
      await (openai.openExternal as (opts: { href: string }) => Promise<void>)({ href: url });
    } else {
      // Fallback
      window.open(url, "_blank");
    }
  }

  async requestDisplayMode(mode: string): Promise<{ mode: string }> {
    const openai = this.getOpenAI();
    if (openai && typeof openai.requestDisplayMode === "function") {
      // API expects { mode: "fullscreen" | "inline" | "pip" }
      const result = await (
        openai.requestDisplayMode as (opts: { mode: string }) => Promise<{ mode: string }>
      )({ mode });
      // Update local context with the actual mode returned
      this.context = { ...this.context, displayMode: result.mode as HostContext["displayMode"] };
      this.notifyContextChange();
      return result;
    }
    // Fallback: just return the requested mode
    this.context = { ...this.context, displayMode: mode as HostContext["displayMode"] };
    this.notifyContextChange();
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
    if (openai && typeof openai.setWidgetState === "function") {
      (openai.setWidgetState as (state: S) => void)(state);
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
      return (openai.getFileDownloadUrl as (fileId: string) => Promise<{ downloadUrl: string }>)(
        fileId
      );
    }
    throw new Error("File download not supported");
  }

  // === Resources ===

  async readResource(uri: string): Promise<{ contents: ResourceContent[] }> {
    const openai = this.getOpenAI();
    if (openai && typeof openai.readResource === "function") {
      return (openai.readResource as (uri: string) => Promise<{ contents: ResourceContent[] }>)(
        uri
      );
    }
    return { contents: [] };
  }

  // === Logging ===

  log(level: string, data: unknown): void {
    /* eslint-disable no-console */
    const logFn =
      { debug: console.debug, info: console.info, warning: console.warn, error: console.error }[
        level
      ] ?? console.log;
    /* eslint-enable no-console */
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
    clientDebugLogger.debug(
      `[OpenAI Adapter] Host context handler added, total: ${String(this.hostContextHandlers.size)}`
    );
    return () => {
      this.hostContextHandlers.delete(handler);
      clientDebugLogger.debug(
        `[OpenAI Adapter] Host context handler removed, total: ${String(this.hostContextHandlers.size)}`
      );
    };
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
    if (!this.currentToolOutput) return undefined;
    const toolName = this.getToolNameFromSDK();
    return toolName ? { [toolName]: this.currentToolOutput } : this.currentToolOutput;
  }

  getToolMeta(): Record<string, unknown> | undefined {
    return this.currentToolMeta;
  }

  // === Host Information ===

  getHostCapabilities(): HostCapabilities | undefined {
    // Derive capabilities from what the SDK actually exposes at runtime
    const openai = this.getOpenAI();

    // Detect available features from the SDK object
    const hasFileUpload = openai && typeof openai.uploadFile === "function";
    const hasSafeArea = this.context.safeAreaInsets !== undefined;
    const hasViews = this.context.view !== undefined;

    return {
      // Common capabilities - always available in ChatGPT
      openLinks: {},
      logging: {},
      theming: {
        // ChatGPT supports light and dark themes
        themes: ["light", "dark"],
      },
      displayModes: {
        // ChatGPT supports these display modes via requestDisplayMode()
        // Note: SDK doesn't expose availableDisplayModes, these are known supported modes
        modes: ["inline", "fullscreen", "pip"],
      },
      statePersistence: {
        persistent: false, // Session-scoped only (widgetState)
      },

      // ChatGPT-specific capabilities - detected from runtime
      fileUpload: hasFileUpload ? {} : undefined,
      safeAreaInsets: hasSafeArea ? {} : undefined,
      views: hasViews ? {} : undefined,
    };
  }

  getHostVersion(): HostVersion | undefined {
    // ChatGPT doesn't expose version info to widgets
    return undefined;
  }

  // === Protocol-Level Logging ===

  async sendLog(
    level: "debug" | "info" | "notice" | "warning" | "error" | "critical" | "alert" | "emergency",
    data: unknown
  ): Promise<void> {
    // Map protocol log levels to our log levels
    const levelMapping: Record<typeof level, "debug" | "info" | "warn" | "error"> = {
      debug: "debug",
      info: "info",
      notice: "info",
      warning: "warn",
      error: "error",
      critical: "error",
      alert: "error",
      emergency: "error",
    };

    const entry: LogEntry = {
      level: levelMapping[level],
      message: typeof data === "string" ? data : JSON.stringify(data),
      data: typeof data === "string" ? undefined : data,
      timestamp: new Date().toISOString(),
      source: "openai-adapter",
    };

    await this.sendLogs([entry]);
  }

  /**
   * Send batched log entries to the server
   *
   * @param entries - Array of log entries to send
   * @returns Number of entries processed
   */
  async sendLogs(entries: LogEntry[]): Promise<{ processed: number }> {
    // Try API transport first if configured
    if (this.logTransport === "api" && this.logApiEndpoint && !this.apiTransportFailed) {
      try {
        const response = await fetch(this.logApiEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ entries }),
        });

        if (!response.ok) {
          throw new Error(`API request failed with status ${String(response.status)}`);
        }

        const result = (await response.json()) as { processed: number };
        return result;
      } catch (error) {
        // Mark API transport as failed and fall through to next option
        this.apiTransportFailed = true;
        clientDebugLogger.info("[OpenAI Adapter] API log transport failed, trying fallback", {
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    // Try tool transport if configured or as fallback
    if (
      (this.logTransport === "tool" || this.apiTransportFailed) &&
      !this.toolTransportFailed &&
      this.connected
    ) {
      try {
        const result = await this.callTool("log_debug", { entries });
        return result as { processed: number };
      } catch (error) {
        // Mark tool transport as failed
        this.toolTransportFailed = true;
        clientDebugLogger.info(
          "[OpenAI Adapter] Tool log transport failed, falling back to console",
          { error: error instanceof Error ? error.message : error }
        );
      }
    }

    // Fallback to console logging
    for (const entry of entries) {
      this.log(entry.level === "warn" ? "warning" : entry.level, entry.data ?? entry.message);
    }

    return { processed: entries.length };
  }

  // === Size Notifications ===

  async sendSizeChanged(params: SizeChangedParams): Promise<void> {
    // ChatGPT uses notifyIntrinsicHeight for height changes
    // We abstract this by using the height from params
    const openai = this.getOpenAI();
    if (openai && typeof openai.notifyIntrinsicHeight === "function") {
      (openai.notifyIntrinsicHeight as (height: number) => void)(params.height);
    }
    // Width changes are not directly supported in ChatGPT
  }

  // === Partial Tool Input ===

  onToolInputPartial(_handler: (input: unknown) => void): () => void {
    // ChatGPT doesn't support partial/streaming tool input
    // Return a no-op unsubscribe function
    this.log("debug", "onToolInputPartial is not supported on ChatGPT");
    return () => {
      /* noop — ChatGPT doesn't support partial tool input */
    };
  }

  // === Bidirectional Tool Support ===

  setCallToolHandler(_handler: CallToolHandler): void {
    // ChatGPT doesn't support bidirectional tool calls (host calling app tools)
    this.log("debug", "setCallToolHandler is not supported on ChatGPT");
  }

  setListToolsHandler(_handler: ListToolsHandler): void {
    // ChatGPT doesn't support bidirectional tool listing
    this.log("debug", "setListToolsHandler is not supported on ChatGPT");
  }
}
