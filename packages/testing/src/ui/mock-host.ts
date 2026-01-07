/**
 * Mock host environment for UI testing
 *
 * Wraps MockAdapter from @mcp-apps-kit/ui and adds testing utilities.
 */

import type { MockHost, MockHostOptions, ToolCall } from "../types";
import { uiLogger } from "../debug";

// Lazy-loaded MockAdapter (to avoid direct dependency)
let MockAdapterClass: typeof import("@mcp-apps-kit/ui/adapters/mock").MockAdapter | null = null;

/**
 * Load MockAdapter class (lazy, throws if not available)
 */
function getMockAdapter(): typeof import("@mcp-apps-kit/ui/adapters/mock").MockAdapter {
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
 * Create a mock host environment for UI testing
 *
 * @param options - Mock host options
 * @returns Mock host instance
 *
 * @example
 * ```typescript
 * const host = createMockHost({
 *   protocol: 'mcp',
 *   initialContext: { theme: 'dark' },
 * });
 *
 * host.emitToolResult({ restaurants: [...] });
 * expect(host.getToolCallHistory()).toHaveLength(1);
 * ```
 */
export function createMockHost(options: MockHostOptions = {}): MockHost {
  uiLogger("Creating mock host with options: %o", options);

  const MockAdapter = getMockAdapter();
  const adapter = new MockAdapter();

  // Track tool call history
  const callHistory: ToolCall[] = [];

  // Set initial context if provided
  if (options.initialContext) {
    adapter.setHostContext(options.initialContext as unknown as Record<string, unknown>);
  }

  // Set capabilities if provided
  if (options.capabilities) {
    adapter.setMockHostCapabilities(options.capabilities as unknown as Record<string, unknown>);
  }

  // Track tool calls
  const originalCallTool = adapter.callTool.bind(adapter);
  adapter.callTool = async (name: string, args: Record<string, unknown>) => {
    const startTime = Date.now();
    const timestamp = new Date();

    try {
      const result = await originalCallTool(name, args);
      const duration = Date.now() - startTime;

      callHistory.push({
        name,
        args,
        result: {
          content: [{ type: "text", text: JSON.stringify(result) }],
          isError: false,
        },
        duration,
        timestamp,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));

      callHistory.push({
        name,
        args,
        error: err,
        duration,
        timestamp,
      });

      throw err;
    }
  };

  return {
    emitToolResult(result: unknown): void {
      uiLogger("Emitting tool result: %o", result);
      adapter.emitToolResult(result);
    },

    setTheme(theme: "light" | "dark"): void {
      uiLogger("Setting theme: %s", theme);
      adapter.setHostContext({ theme } as unknown as Record<string, unknown>);
    },

    emitToolCancelled(reason?: string): void {
      uiLogger("Emitting tool cancelled: %s", reason ?? "no reason");
      adapter.emitToolCancelled(reason);
    },

    emitTeardown(reason?: string): void {
      uiLogger("Emitting teardown: %s", reason ?? "no reason");
      adapter.emitTeardown(reason);
    },

    getToolCallHistory(): ToolCall[] {
      return [...callHistory];
    },

    clearHistory(): void {
      callHistory.length = 0;
    },

    onToolCall(handler: (name: string, args: unknown) => void): () => void {
      // Wrap the handler to track calls
      const wrappedHandler = (input: unknown) => {
        if (typeof input === "object" && input !== null) {
          // Try to extract tool name and args from input
          // This is a simplified approach - in practice, the input structure
          // depends on how the UI client calls tools
          const inputObj = input as Record<string, unknown>;
          if ("name" in inputObj && "args" in inputObj) {
            handler(inputObj.name as string, inputObj.args);
          }
        }
      };

      return adapter.onToolInput(wrappedHandler);
    },

    getAdapter(): unknown {
      return adapter;
    },
  };
}
