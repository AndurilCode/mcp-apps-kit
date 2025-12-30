/**
 * MCP Apps adapter for Claude Desktop
 *
 * Implements the ProtocolAdapter interface for MCP Apps running in Claude Desktop.
 * Uses @modelcontextprotocol/ext-apps (JSON-RPC over postMessage + ui/initialize).
 */

import { App } from "@modelcontextprotocol/ext-apps";
import { UIError, UIErrorCode } from "../errors";

type ResourceReadResult = {
  contents: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string; // base64
  }>;
};

const AnySchema = {
  // ext-apps expects a schema-like object with a parse() method.
  // We keep this permissive to avoid depending on @modelcontextprotocol/sdk.
  parse: (value: unknown) => value,
} as const;

type ExtAppsLogLevel =
  | "debug"
  | "info"
  | "notice"
  | "warning"
  | "error"
  | "critical"
  | "alert"
  | "emergency";

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
  private toolInputPartialHandlers: Set<(input: unknown) => void> = new Set();
  private toolCancelledHandlers: Set<(reason?: string) => void> = new Set();
  private hostContextHandlers: Set<(context: HostContext) => void> = new Set();
  private teardownHandlers: Set<(reason?: string) => void> = new Set();
  private currentToolInput?: Record<string, unknown>;
  private currentToolOutput?: Record<string, unknown>;
  private currentToolMeta?: Record<string, unknown>;
  private app?: App;
  private callToolHandler?: CallToolHandler;
  private listToolsHandler?: ListToolsHandler;

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
    if (this.connected) return;

    // SSR / tests (no window): behave as connected but inert.
    if (typeof window === "undefined") {
      this.connected = true;
      return;
    }

    // Instantiate App and register handlers BEFORE connecting.
    // Declare tools capability to enable calling server tools and registering bidirectional tool handlers.
    this.app = new App({ name: "@mcp-apps-kit/ui", version: "0.0.0" }, { tools: {} });

    this.app.onerror = (err) => {
      this.log("error", err);
    };

    this.app.onhostcontextchanged = (params) => {
      // ext-apps sends { hostContext }, but keep this tolerant.
      const hostContext = (params as { hostContext?: unknown }).hostContext ?? (params as unknown);
      this.context = this.mapHostContext(hostContext);
      this.currentToolMeta = this.extractToolMeta(hostContext);
      for (const handler of this.hostContextHandlers) {
        handler(this.context);
      }
    };

    this.app.ontoolinput = (params) => {
      const args = (params as { arguments?: Record<string, unknown> }).arguments;
      if (args) {
        this.currentToolInput = args;
        for (const handler of this.toolInputHandlers) {
          handler(args);
        }
      }
    };

    // Handle partial/streaming tool input
    this.app.ontoolinputpartial = (params) => {
      const args = (params as { arguments?: Record<string, unknown> }).arguments;
      if (args) {
        for (const handler of this.toolInputPartialHandlers) {
          handler(args);
        }
      }
    };

    // Handle tool calls from host (bidirectional support)
    this.app.oncalltool = async (params) => {
      const { name, arguments: args } = params as {
        name: string;
        arguments?: Record<string, unknown>;
      };
      try {
        if (this.callToolHandler) {
          const result = await this.callToolHandler(name, args ?? {});
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        return {
          content: [{ type: "text", text: `No handler registered for tool: ${name}` }],
          isError: true,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: message }],
          isError: true,
        };
      }
    };

    // Handle list tools requests from host (bidirectional support)
    // The ext-apps SDK expects tools as an array of tool names (strings)
    // Full tool definitions are provided through the MCP server, not the app
    this.app.onlisttools = async () => {
      if (this.listToolsHandler) {
        const tools = await this.listToolsHandler();
        return {
          tools: tools.map((t) => t.name),
        };
      }
      return { tools: [] };
    };

    this.app.ontoolresult = (result) => {
      const output = this.extractToolOutput(result);
      this.currentToolOutput = output;

      // Wrap output with tool name so hooks like useToolResult get { toolName: output }
      const toolName = this.getToolNameFromContext();
      const wrappedResult = toolName ? { [toolName]: output } : output;

      for (const handler of this.toolResultHandlers) {
        handler(wrappedResult);
      }
    };

    this.app.ontoolcancelled = (params) => {
      const reason = (params as { reason?: string }).reason;
      for (const handler of this.toolCancelledHandlers) {
        handler(reason);
      }
    };

    this.app.onteardown = async (params) => {
      const reason = (params as { reason?: string }).reason;
      for (const handler of this.teardownHandlers) {
        handler(reason);
      }
      return {};
    };

    await this.app.connect();
    // Seed initial context if available
    const initialContext = this.app.getHostContext();
    if (initialContext) {
      this.context = this.mapHostContext(initialContext);
      this.currentToolMeta = this.extractToolMeta(initialContext);
    }

    this.connected = true;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private mapHostContext(raw: unknown): HostContext {
    const ctx = (raw ?? {}) as Partial<HostContext> & {
      theme?: unknown;
      displayMode?: unknown;
      availableDisplayModes?: unknown;
      viewport?: unknown;
      locale?: unknown;
      timeZone?: unknown;
      platform?: unknown;
      userAgent?: unknown;
      deviceCapabilities?: unknown;
      safeAreaInsets?: unknown;
      styles?: unknown;
      view?: unknown;
    };

    // Keep defaults, overlay with host values when present.
    const base = this.createDefaultContext();

    const theme = ctx.theme === "dark" ? "dark" : ctx.theme === "light" ? "light" : base.theme;
    const displayMode =
      ctx.displayMode === "fullscreen" || ctx.displayMode === "pip" || ctx.displayMode === "inline"
        ? (ctx.displayMode as HostContext["displayMode"])
        : base.displayMode;

    const availableDisplayModes = Array.isArray(ctx.availableDisplayModes)
      ? ctx.availableDisplayModes.filter((m): m is string => typeof m === "string")
      : base.availableDisplayModes;

    const isViewportObject = (v: unknown): v is Record<string, unknown> =>
      v !== null && typeof v === "object" && !Array.isArray(v);
    const viewport = isViewportObject(ctx.viewport)
      ? { ...base.viewport, ...ctx.viewport }
      : base.viewport;

    const locale = typeof ctx.locale === "string" ? ctx.locale : base.locale;
    const timeZone = typeof ctx.timeZone === "string" ? ctx.timeZone : base.timeZone;

    // Our HostContext platform is narrower than ext-apps; keep existing default.
    const platform = base.platform;

    return {
      ...base,
      theme,
      displayMode,
      availableDisplayModes,
      viewport,
      locale,
      timeZone,
      platform,
      userAgent: typeof ctx.userAgent === "string" ? ctx.userAgent : base.userAgent,
      deviceCapabilities: ctx.deviceCapabilities as HostContext["deviceCapabilities"],
      safeAreaInsets: ctx.safeAreaInsets as HostContext["safeAreaInsets"],
      styles: ctx.styles as HostContext["styles"],
      view: typeof ctx.view === "string" ? ctx.view : base.view,
    };
  }

  private extractToolMeta(rawHostContext: unknown): Record<string, unknown> | undefined {
    if (rawHostContext === null || typeof rawHostContext !== "object") return undefined;
    const hc = rawHostContext as { toolInfo?: unknown };
    if (!hc.toolInfo || typeof hc.toolInfo !== "object") return undefined;
    return { toolInfo: hc.toolInfo as Record<string, unknown> };
  }

  /**
   * Extract tool name from current host context's toolInfo.
   * Returns undefined if toolInfo is not available.
   */
  private getToolNameFromContext(): string | undefined {
    if (!this.app) return undefined;
    const hostContext = this.app.getHostContext();
    if (!hostContext) return undefined;

    const toolInfo = (hostContext as { toolInfo?: { tool?: { name?: string } } }).toolInfo;
    return toolInfo?.tool?.name;
  }

  private extractToolOutput(result: unknown): Record<string, unknown> {
    const structured = (result as { structuredContent?: unknown }).structuredContent;
    const meta = (result as { _meta?: unknown })._meta;

    const base: Record<string, unknown> =
      structured && typeof structured === "object" && !Array.isArray(structured)
        ? (structured as Record<string, unknown>)
        : {};

    if (meta && typeof meta === "object" && !Array.isArray(meta)) {
      return { ...base, _meta: meta as Record<string, unknown> };
    }

    // Best-effort fallback: try to parse text content as JSON.
    if (Object.keys(base).length === 0) {
      const content = (result as { content?: unknown }).content;
      if (Array.isArray(content) && content.length > 0) {
        const first = content[0] as { type?: unknown; text?: unknown } | undefined;
        if (first?.type === "text" && typeof first.text === "string") {
          try {
            const parsed: unknown = JSON.parse(first.text);
            if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
              return parsed as Record<string, unknown>;
            }
          } catch {
            // ignore
          }
        }
      }
    }

    return base;
  }

  // === Tool Operations ===

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.app) {
      throw new Error("MCP Apps adapter not connected");
    }

    const result = await this.app.callServerTool({
      name,
      arguments: args,
    });

    // AppsClient expects structured output shape.
    return this.extractToolOutput(result);
  }

  // === Messaging ===

  async sendMessage(content: { type: string; text: string }): Promise<void> {
    if (!this.app) {
      throw new Error("MCP Apps adapter not connected");
    }
    if (content.type !== "text") {
      throw new Error(`Unsupported message content type: ${content.type}`);
    }
    await this.app.sendMessage({
      role: "user",
      content: [{ type: "text", text: content.text }],
    });
  }

  // === Navigation ===

  async openLink(url: string): Promise<void> {
    if (!this.app) {
      throw new Error("MCP Apps adapter not connected");
    }
    await this.app.openLink({ url });
  }

  async requestDisplayMode(mode: string): Promise<{ mode: string }> {
    if (!this.app) {
      throw new Error("MCP Apps adapter not connected");
    }
    const result = await this.app.requestDisplayMode({
      mode: mode as "inline" | "fullscreen" | "pip",
    });
    return result as { mode: string };
  }

  requestClose(): void {
    // MCP Apps host does not define a standard "close" request from UI.
    // Keep as graceful no-op.
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
    if (!this.app) {
      throw new Error("MCP Apps adapter not connected");
    }

    // App.request() is strongly typed (schema-driven) and can trip TS into
    // extremely deep instantiations. We only need a runtime-validated result.
    type RequestFn = (req: unknown, schema: unknown, options?: unknown) => Promise<unknown>;
    const request = (this.app.request as unknown as RequestFn).bind(this.app);

    const result = (await request(
      { method: "resources/read", params: { uri } },
      AnySchema
    )) as ResourceReadResult;

    // Normalize to our ResourceContent shape.
    return {
      contents: (Array.isArray(result.contents) ? result.contents : []).map((c) => {
        const base = {
          uri: c.uri,
          mimeType: c.mimeType ?? "application/octet-stream",
        };
        if ("text" in c && typeof c.text === "string") {
          return { ...base, text: c.text };
        }
        if ("blob" in c && typeof c.blob === "string") {
          // sdk encodes blob as base64 string
          const bytes = Uint8Array.from(atob(c.blob), (ch) => ch.charCodeAt(0));
          return { ...base, blob: bytes };
        }
        return base;
      }),
    };
  }

  // === Logging ===

  log(level: string, data: unknown): void {
    if (this.app) {
      const normalizedLevel: ExtAppsLogLevel = (
        ["debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"] as const
      ).includes(level as ExtAppsLogLevel)
        ? (level as ExtAppsLogLevel)
        : "info";

      const params = {
        level: normalizedLevel,
        data,
        logger: "@mcp-apps-kit/ui",
      };
      try {
        void this.app.sendLog(params);
        return;
      } catch {
        // fall back to console below
      }
    }

    // Fallback logging when MCP logging unavailable
    const logMapping: Record<typeof level, typeof console.log> = {
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

  // === Host Information ===

  getHostCapabilities(): HostCapabilities | undefined {
    if (!this.app) return undefined;
    const mcpCaps = this.app.getHostCapabilities();
    if (!mcpCaps) return undefined;

    // Map MCP Apps SDK capabilities to our unified interface.
    // MCP SDK already provides: logging, openLinks, serverResources, serverTools
    // We augment with common abstraction fields for protocol-agnostic usage.
    const sdkCaps = mcpCaps as HostCapabilities;

    // Extract available display modes from host context if provided
    const hostContext = this.app.getHostContext();
    const availableModes = hostContext?.availableDisplayModes as string[] | undefined;

    return {
      // MCP SDK native capabilities (priority)
      logging: sdkCaps.logging,
      openLinks: sdkCaps.openLinks,
      serverResources: sdkCaps.serverResources,
      serverTools: sdkCaps.serverTools,
      experimental: sdkCaps.experimental,

      // Common capabilities derived from host context when available
      theming: {
        // MCP Apps supports light and dark themes (os resolves to one of these)
        themes: ["light", "dark"],
      },
      displayModes: availableModes
        ? { modes: availableModes as ("inline" | "fullscreen" | "pip" | "panel")[] }
        : undefined,
      statePersistence: {
        persistent: false, // MCP Apps doesn't have persistent state
      },

      // MCP Apps-specific capabilities (always available when connected)
      sizeNotifications: {},
      partialToolInput: {},
      appTools: { listChanged: false },
    };
  }

  getHostVersion(): HostVersion | undefined {
    if (!this.app) return undefined;
    const version = this.app.getHostVersion();
    if (!version) return undefined;
    return {
      name: version.name,
      version: version.version,
    };
  }

  // === Protocol-Level Logging ===

  async sendLog(
    level: "debug" | "info" | "notice" | "warning" | "error" | "critical" | "alert" | "emergency",
    data: unknown
  ): Promise<void> {
    if (!this.app) {
      throw new UIError(UIErrorCode.NOT_CONNECTED, "MCP Apps adapter not connected");
    }
    await this.app.sendLog({
      level,
      data,
      logger: "@mcp-apps-kit/ui",
    });
  }

  // === Size Notifications ===

  async sendSizeChanged(params: SizeChangedParams): Promise<void> {
    if (!this.app) {
      throw new UIError(UIErrorCode.NOT_CONNECTED, "MCP Apps adapter not connected");
    }
    await this.app.sendSizeChanged({
      width: params.width,
      height: params.height,
    });
  }

  // === Partial Tool Input ===

  onToolInputPartial(handler: (input: unknown) => void): () => void {
    this.toolInputPartialHandlers.add(handler);
    return () => this.toolInputPartialHandlers.delete(handler);
  }

  // === Bidirectional Tool Support ===

  setCallToolHandler(handler: CallToolHandler): void {
    this.callToolHandler = handler;
  }

  setListToolsHandler(handler: ListToolsHandler): void {
    this.listToolsHandler = handler;
  }
}
