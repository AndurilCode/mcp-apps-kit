/**
 * Mock host environment for UI testing
 *
 * Wraps MockAdapter from @mcp-apps-kit/ui and adds testing utilities.
 */

import type { MockHost, MockHostOptions, ToolCall } from "../types";
import { uiLogger } from "../debug";

// Lazy-loaded MockAdapter (to avoid direct dependency)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let MockAdapterClass: any = null;

/**
 * Load MockAdapter class (lazy, throws if not available)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getMockAdapter(): any {
  if (!MockAdapterClass) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const uiModule = require("@mcp-apps-kit/ui/adapters/mock");
      MockAdapterClass = uiModule.MockAdapter;
    } catch {
      throw new Error(
        "@mcp-apps-kit/ui is required for mock host testing. Install it with: npm install @mcp-apps-kit/ui"
      );
    }
  }
  return MockAdapterClass;
}

/**
 * Create a mock host environment for testing UI components
 */
export function createMockHost(options: MockHostOptions = {}): MockHost {
  uiLogger("Creating mock host with options: %o", options);

  const MockAdapter = getMockAdapter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adapter = new MockAdapter(options) as any;

  // Tool call history tracking
  const toolCallHistory: ToolCall[] = [];

  // Tool call handlers
  const toolCallHandlers: Array<(name: string, args: unknown) => void> = [];

  return {
    emitToolResult(result: unknown): void {
      uiLogger("Mock host emitting tool result: %o", result);
      adapter.emitToolResult?.(result);
    },

    setTheme(theme: "light" | "dark"): void {
      uiLogger("Mock host setting theme: %s", theme);
      adapter.setTheme?.(theme);
    },

    emitToolCancelled(reason?: string): void {
      uiLogger("Mock host emitting tool cancelled: %s", reason);
      adapter.emitToolCancelled?.(reason);
    },

    emitTeardown(reason?: string): void {
      uiLogger("Mock host emitting teardown: %s", reason);
      adapter.emitTeardown?.(reason);
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

    getAdapter(): unknown {
      return adapter;
    },
  };
}
