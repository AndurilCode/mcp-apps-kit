/**
 * Unified AppsClient implementation
 *
 * Wraps protocol adapters to provide the unified AppsClient interface.
 *
 * @internal
 */

import type {
  AppsClient,
  HostContext,
  ResourceContent,
  ToolDefs,
  ToolResult,
  InferToolInputs,
  InferToolOutputs,
  HostCapabilities,
  HostVersion,
  SizeChangedParams,
  CallToolHandler,
  ListToolsHandler,
  ToolMethods,
} from "./types";
import type { ProtocolAdapter } from "./adapters/types";

/**
 * Create a Proxy-based tools object that generates typed methods dynamically.
 *
 * The Proxy intercepts property access and converts method names like `callGreet`
 * to tool calls for the `greet` tool.
 *
 * @internal
 */
function createToolsProxy<T extends ToolDefs>(
  callTool: <K extends keyof T>(
    name: K,
    args: InferToolInputs<T>[K]
  ) => Promise<InferToolOutputs<T>[K]>
): ToolMethods<T> {
  return new Proxy({} as ToolMethods<T>, {
    get(_target, prop: string | symbol) {
      // Only handle string properties that start with "call"
      if (typeof prop !== "string" || !prop.startsWith("call")) {
        return undefined;
      }

      // Extract tool name: "callGreet" -> "greet", "callGetUser" -> "getUser"
      const methodName = prop.slice(4); // Remove "call" prefix
      if (methodName.length === 0) {
        return undefined;
      }

      // Convert first character to lowercase: "Greet" -> "greet"
      const toolName = methodName.charAt(0).toLowerCase() + methodName.slice(1);

      // Return a function that calls the tool
      return (args: unknown) => callTool(toolName as keyof T, args as InferToolInputs<T>[keyof T]);
    },

    // Support checking if a method exists
    has(_target, prop: string | symbol) {
      return typeof prop === "string" && prop.startsWith("call") && prop.length > 4;
    },

    // Prevent enumeration (tools are lazily created)
    ownKeys() {
      return [];
    },

    getOwnPropertyDescriptor(_target, prop: string | symbol) {
      if (typeof prop === "string" && prop.startsWith("call") && prop.length > 4) {
        return {
          configurable: true,
          enumerable: true,
          writable: false,
        };
      }
      return undefined;
    },
  });
}

/**
 * Create an AppsClient that wraps a protocol adapter
 *
 * @internal
 */
export function createAppsClient<T extends ToolDefs = ToolDefs>(
  adapter: ProtocolAdapter
): AppsClient<T> {
  // Define callTool as a standalone function so we can use it in the proxy
  async function callTool<K extends keyof T>(
    name: K,
    args: InferToolInputs<T>[K]
  ): Promise<InferToolOutputs<T>[K]> {
    const result = await adapter.callTool(name as string, args as Record<string, unknown>);
    return result as InferToolOutputs<T>[K];
  }

  // Create the tools proxy for typed method access
  const toolsProxy = createToolsProxy<T>(callTool);

  const client: AppsClient<T> = {
    // === Tool Operations ===

    callTool,

    tools: toolsProxy,

    // === Messaging ===

    async sendMessage(content: { type: "text"; text: string }): Promise<void> {
      await adapter.sendMessage(content);
    },

    async sendFollowUpMessage(prompt: string): Promise<void> {
      await adapter.sendMessage({ type: "text", text: prompt });
    },

    // === Navigation ===

    async openLink(url: string): Promise<void> {
      await adapter.openLink(url);
    },

    async requestDisplayMode(mode: "inline" | "fullscreen" | "pip"): Promise<{ mode: string }> {
      return adapter.requestDisplayMode(mode);
    },

    requestClose(): void {
      adapter.requestClose();
    },

    // === State ===

    getState<S>(): S | null {
      return adapter.getState<S>();
    },

    setState<S>(state: S): void {
      adapter.setState(state);
    },

    // === Files (Optional) ===

    ...(adapter.uploadFile && {
      uploadFile: (file: File) => {
        if (adapter.uploadFile) {
          return adapter.uploadFile(file);
        }
        throw new Error("uploadFile not supported");
      },
    }),
    ...(adapter.getFileDownloadUrl && {
      getFileDownloadUrl: (fileId: string) => {
        if (adapter.getFileDownloadUrl) {
          return adapter.getFileDownloadUrl(fileId);
        }
        throw new Error("getFileDownloadUrl not supported");
      },
    }),

    // === Resources ===

    async readResource(uri: string): Promise<{ contents: ResourceContent[] }> {
      return adapter.readResource(uri);
    },

    // === Logging ===

    log(level: "debug" | "info" | "warning" | "error", data: unknown): void {
      adapter.log(level, data);
    },

    // === Events ===

    onToolResult(handler: (result: ToolResult<T>) => void): () => void {
      return adapter.onToolResult(handler as (result: unknown) => void);
    },

    onToolInput(handler: (input: Record<string, unknown>) => void): () => void {
      return adapter.onToolInput(handler as (input: unknown) => void);
    },

    onToolCancelled(handler: (reason?: string) => void): () => void {
      return adapter.onToolCancelled(handler);
    },

    onHostContextChange(handler: (context: HostContext) => void): () => void {
      return adapter.onHostContextChange(handler);
    },

    onTeardown(handler: (reason?: string) => void): () => void {
      return adapter.onTeardown(handler);
    },

    onToolInputPartial(handler: (input: Record<string, unknown>) => void): () => void {
      return adapter.onToolInputPartial(handler as (input: unknown) => void);
    },

    // === Host Information ===

    getHostCapabilities(): HostCapabilities | undefined {
      return adapter.getHostCapabilities();
    },

    getHostVersion(): HostVersion | undefined {
      return adapter.getHostVersion();
    },

    // === Protocol-Level Logging ===

    async sendLog(
      level: "debug" | "info" | "notice" | "warning" | "error" | "critical" | "alert" | "emergency",
      data: unknown
    ): Promise<void> {
      return adapter.sendLog(level, data);
    },

    // === Size Notifications ===

    async sendSizeChanged(params: SizeChangedParams): Promise<void> {
      return adapter.sendSizeChanged(params);
    },

    setupSizeChangedNotifications(): () => void {
      // Only run in browser environments
      if (typeof window === "undefined" || typeof ResizeObserver === "undefined") {
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        return () => {};
      }

      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          void adapter.sendSizeChanged({ width: Math.round(width), height: Math.round(height) });
        }
      });

      observer.observe(document.body);

      return () => {
        observer.disconnect();
      };
    },

    // === Bidirectional Tool Support ===

    setCallToolHandler(handler: CallToolHandler): void {
      adapter.setCallToolHandler(handler);
    },

    setListToolsHandler(handler: ListToolsHandler): void {
      adapter.setListToolsHandler(handler);
    },

    // === Accessors ===

    get hostContext(): HostContext {
      return adapter.getHostContext();
    },

    get toolInput(): Record<string, unknown> | undefined {
      return adapter.getToolInput();
    },

    get toolOutput(): Record<string, unknown> | undefined {
      return adapter.getToolOutput();
    },

    get toolMeta(): Record<string, unknown> | undefined {
      return adapter.getToolMeta();
    },
  };

  return client;
}
