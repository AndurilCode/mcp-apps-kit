/**
 * Mock host environment for UI testing
 *
 * Provides a mock host environment for testing UI widgets without
 * requiring an actual MCP host platform.
 */

import type { MockHost, MockHostOptions, ToolCall } from "../types";
import { uiLogger } from "../debug";

/**
 * Create a mock host environment for testing UI components
 *
 * This creates a standalone mock host that can be used to test UI widgets
 * without requiring an actual host platform (like Claude Desktop or ChatGPT).
 *
 * @param options - Mock host configuration
 * @returns Mock host instance
 *
 * @example
 * ```typescript
 * const mockHost = createMockHost({
 *   initialContext: { theme: 'dark' },
 * });
 *
 * // Register a tool call handler
 * mockHost.onToolCall((name, args) => {
 *   console.log(`Tool called: ${name}`, args);
 * });
 *
 * // Emit a tool result (simulating what the host would send)
 * mockHost.emitToolResult({ message: 'Hello!' });
 *
 * // Check tool call history
 * const history = mockHost.getToolCallHistory();
 * ```
 */
export function createMockHost(options: MockHostOptions = {}): MockHost {
  uiLogger("Creating mock host with options: %o", options);

  // Internal state
  let currentTheme: "light" | "dark" = options.initialContext?.theme ?? "light";
  const toolCallHistory: ToolCall[] = [];
  const toolCallHandlers: Array<(name: string, args: unknown) => void> = [];
  const toolResultHandlers: Array<(result: unknown) => void> = [];
  const teardownHandlers: Array<(reason?: string) => void> = [];
  const cancelledHandlers: Array<(reason?: string) => void> = [];

  // Try to load MockAdapter from @mcp-apps-kit/ui if available
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let uiAdapter: any = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MockAdapter } = require("@mcp-apps-kit/ui/adapters/mock");
    uiAdapter = new MockAdapter();
    uiLogger("Using MockAdapter from @mcp-apps-kit/ui");
  } catch {
    uiLogger("@mcp-apps-kit/ui not available, using standalone mock");
  }

  return {
    emitToolResult(result: unknown): void {
      uiLogger("Mock host emitting tool result: %o", result);
      
      // Record in history
      toolCallHistory.push({
        name: "_result",
        args: result,
        result: {
          content: [{ type: "text", text: JSON.stringify(result) }],
          isError: false,
        },
        duration: 0,
        timestamp: new Date(),
      });

      // Notify handlers
      for (const handler of toolResultHandlers) {
        handler(result);
      }

      // Forward to UI adapter if available
      if (uiAdapter?.emitToolResult) {
        uiAdapter.emitToolResult(result);
      }
    },

    setTheme(theme: "light" | "dark"): void {
      uiLogger("Mock host setting theme: %s", theme);
      currentTheme = theme;

      // Forward to UI adapter if available
      if (uiAdapter?.setHostContext) {
        uiAdapter.setHostContext({ theme });
      }
    },

    getTheme(): "light" | "dark" {
      return currentTheme;
    },

    emitToolCancelled(reason?: string): void {
      uiLogger("Mock host emitting tool cancelled: %s", reason);

      // Notify handlers
      for (const handler of cancelledHandlers) {
        handler(reason);
      }

      // Forward to UI adapter if available
      if (uiAdapter?.emitToolCancelled) {
        uiAdapter.emitToolCancelled(reason);
      }
    },

    emitTeardown(reason?: string): void {
      uiLogger("Mock host emitting teardown: %s", reason);

      // Notify handlers
      for (const handler of teardownHandlers) {
        handler(reason);
      }

      // Forward to UI adapter if available
      if (uiAdapter?.emitTeardown) {
        uiAdapter.emitTeardown(reason);
      }
    },

    getToolCallHistory(): ToolCall[] {
      return [...toolCallHistory];
    },

    clearHistory(): void {
      uiLogger("Clearing mock host tool call history");
      toolCallHistory.length = 0;
    },

    onToolCall(handler: (name: string, args: unknown) => void): () => void {
      toolCallHandlers.push(handler);
      return () => {
        const index = toolCallHandlers.indexOf(handler);
        if (index >= 0) {
          toolCallHandlers.splice(index, 1);
        }
      };
    },

    onToolResult(handler: (result: unknown) => void): () => void {
      toolResultHandlers.push(handler);
      return () => {
        const index = toolResultHandlers.indexOf(handler);
        if (index >= 0) {
          toolResultHandlers.splice(index, 1);
        }
      };
    },

    onTeardown(handler: (reason?: string) => void): () => void {
      teardownHandlers.push(handler);
      return () => {
        const index = teardownHandlers.indexOf(handler);
        if (index >= 0) {
          teardownHandlers.splice(index, 1);
        }
      };
    },

    onToolCancelled(handler: (reason?: string) => void): () => void {
      cancelledHandlers.push(handler);
      return () => {
        const index = cancelledHandlers.indexOf(handler);
        if (index >= 0) {
          cancelledHandlers.splice(index, 1);
        }
      };
    },

    /**
     * Simulate a tool call (for testing)
     */
    simulateToolCall(name: string, args: unknown): void {
      uiLogger("Mock host simulating tool call: %s with args: %o", name, args);

      // Record in history
      toolCallHistory.push({
        name,
        args,
        duration: 0,
        timestamp: new Date(),
      });

      // Notify handlers
      for (const handler of toolCallHandlers) {
        handler(name, args);
      }
    },

    getAdapter(): unknown {
      return uiAdapter;
    },
  };
}
