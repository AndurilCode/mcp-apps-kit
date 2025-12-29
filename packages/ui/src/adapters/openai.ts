/* eslint-disable no-console -- Debug logging is intentional for this adapter */
/**
 * OpenAI/ChatGPT Apps adapter
 *
 * Implements the ProtocolAdapter interface for ChatGPT Apps.
 * Would integrate with the OpenAI Apps SDK when available.
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
  private globalsHandler?: (event: MessageEvent) => void;

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

    console.log("[OpenAI Adapter] Read context from SDK:", this.context);
  }

  /**
   * Notify all registered handlers of context changes
   */
  private notifyContextChange(): void {
    console.log(
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

  // === Lifecycle ===

  async connect(): Promise<void> {
    // Wait for the OpenAI SDK to be available (injected by ChatGPT sandbox)
    await this.waitForOpenAI();

    const openai = this.getOpenAI();

    // Log available SDK methods for debugging
    if (openai) {
      console.log("[OpenAI Adapter] Available SDK methods:", Object.keys(openai));

      // Read initial host context from SDK properties
      this.readContextFromSDK();

      // Try to get initial tool context
      if (typeof openai.getToolOutput === "function") {
        this.currentToolOutput = (openai.getToolOutput as () => Record<string, unknown>)();
        console.log("[OpenAI Adapter] Got tool output from SDK");
      } else if (openai.toolOutput) {
        this.currentToolOutput = openai.toolOutput as Record<string, unknown>;
        console.log("[OpenAI Adapter] Got tool output from SDK property");
      } else if (openai.result) {
        this.currentToolOutput = openai.result as Record<string, unknown>;
        console.log("[OpenAI Adapter] Got result from SDK");
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

    // Subscribe to context changes via postMessage
    this.setupGlobalsListener();

    this.connected = true;
  }

  /**
   * Set up listener for openai:set_globals messages
   * The host fires these events when context values change (theme, locale, etc.)
   */
  private setupGlobalsListener(): void {
    if (typeof window === "undefined") return;

    this.globalsHandler = (event: MessageEvent) => {
      const data = event.data as unknown;

      // Handle various message formats for set_globals
      const isSetGlobals =
        data === "openai:set_globals" ||
        (typeof data === "object" &&
          data !== null &&
          "type" in data &&
          (data as { type: unknown }).type === "openai:set_globals") ||
        (typeof data === "object" &&
          data !== null &&
          "message" in data &&
          (data as { message: unknown }).message === "openai:set_globals");

      if (isSetGlobals) {
        console.log("[OpenAI Adapter] Received set_globals event, refreshing context");

        // Give a small delay for the globals to be applied
        setTimeout(() => {
          const previousTheme = this.context.theme;
          const previousLocale = this.context.locale;
          const previousDisplayMode = this.context.displayMode;

          this.readContextFromSDK();

          // Check if anything actually changed
          if (
            this.context.theme !== previousTheme ||
            this.context.locale !== previousLocale ||
            this.context.displayMode !== previousDisplayMode
          ) {
            console.log("[OpenAI Adapter] Context changed, notifying handlers");
            this.notifyContextChange();
          }
        }, 10);
      }
    };

    window.addEventListener("message", this.globalsHandler);
  }

  private async waitForOpenAI(timeout = 5000): Promise<void> {
    // If already available, return immediately
    if (this.getOpenAI()) {
      console.log("[OpenAI Adapter] window.openai already available");
      return;
    }

    console.log("[OpenAI Adapter] Waiting for window.openai...");

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
          console.log("[OpenAI Adapter] window.openai found via polling");
          doResolve();
          return;
        }

        if (Date.now() - startTime > timeout) {
          // Timeout - resolve anyway as we might be in a dev/testing environment
          console.warn("[OpenAI Adapter] window.openai not found after timeout, proceeding anyway");
          doResolve();
          return;
        }

        // Check again in 50ms
        setTimeout(check, 50);
      };

      // Also listen for the set_globals message (various formats)
      const messageHandler = (event: MessageEvent) => {
        const data = event.data as unknown;
        // Handle both string and object formats
        const isSetGlobals =
          data === "openai:set_globals" ||
          (typeof data === "object" &&
            data !== null &&
            "type" in data &&
            (data as { type: unknown }).type === "openai:set_globals") ||
          (typeof data === "object" &&
            data !== null &&
            "message" in data &&
            (data as { message: unknown }).message === "openai:set_globals");

        if (isSetGlobals) {
          console.log("[OpenAI Adapter] Received set_globals message");
          // Give a small delay for the globals to be applied, then check
          setTimeout(() => {
            if (this.getOpenAI()) {
              console.log("[OpenAI Adapter] window.openai available after set_globals");
              doResolve();
            } else {
              console.log(
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
    const openai = this.getOpenAI();
    if (openai && typeof openai.sendMessage === "function") {
      await (openai.sendMessage as (content: { type: string; text: string }) => Promise<void>)(
        content
      );
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
    const logFn =
      {
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
    console.log(
      `[OpenAI Adapter] Host context handler added, total: ${String(this.hostContextHandlers.size)}`
    );
    return () => {
      this.hostContextHandlers.delete(handler);
      console.log(
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
    return this.currentToolOutput;
  }

  getToolMeta(): Record<string, unknown> | undefined {
    return this.currentToolMeta;
  }

  // === Host Information ===

  getHostCapabilities(): HostCapabilities | undefined {
    // Return capabilities that ChatGPT supports
    return {
      // Common capabilities
      openLinks: {},
      logging: {},
      theming: {
        themes: ["light", "dark"],
      },
      displayModes: {
        modes: ["inline", "fullscreen", "pip"],
      },
      statePersistence: {
        persistent: false, // Session-scoped only
      },

      // ChatGPT-specific capabilities
      fileUpload: {}, // Supported via uploadFile()
      safeAreaInsets: {}, // Available on mobile
      views: {}, // View identification supported
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
    // ChatGPT doesn't have protocol-level logging
    // Map to the adapter's log method levels
    const levelMapping: Record<typeof level, "debug" | "info" | "warning" | "error"> = {
      debug: "debug",
      info: "info",
      notice: "info",
      warning: "warning",
      error: "error",
      critical: "error",
      alert: "error",
      emergency: "error",
    };
    this.log(levelMapping[level], data);
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
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    return () => {};
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
