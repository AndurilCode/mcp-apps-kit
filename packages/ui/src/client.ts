/**
 * Unified AppsClient implementation
 *
 * Wraps protocol adapters to provide the unified AppsClient interface.
 */

import type {
  AppsClient,
  HostContext,
  ResourceContent,
  ToolDefs,
  ToolResult,
  InferToolInputs,
  InferToolOutputs,
} from "./types";
import type { ProtocolAdapter } from "./adapters/types";

/**
 * Create an AppsClient that wraps a protocol adapter
 */
export function createAppsClient<T extends ToolDefs = ToolDefs>(
  adapter: ProtocolAdapter
): AppsClient<T> {
  const client: AppsClient<T> = {
    // === Tool Operations ===

    async callTool<K extends keyof T>(
      name: K,
      args: InferToolInputs<T>[K]
    ): Promise<InferToolOutputs<T>[K]> {
      const result = await adapter.callTool(name as string, args as Record<string, unknown>);
      return result as InferToolOutputs<T>[K];
    },

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
