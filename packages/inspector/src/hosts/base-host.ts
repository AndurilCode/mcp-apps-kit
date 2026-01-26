/**
 * Base Host Emulator
 *
 * Abstract base class for host emulators (MCP and OpenAI).
 * Provides shared interfaces and tool call tracking functionality.
 */

/**
 * JSDOM type - minimal interface for type safety
 * Used by both MCP and OpenAI host emulators for jsdom injection
 */
export interface JSDOMInterface {
  window: Window;
}

/**
 * Tracked tool call from the widget
 * Records tool calls made by the widget for inspection and testing
 */
export interface TrackedToolCall {
  /** Name of the tool that was called */
  name: string;
  /** Arguments passed to the tool */
  args: unknown;
  /** Timestamp when the call was made */
  timestamp: number;
}

/**
 * Base options shared by all host emulators
 */
export interface BaseHostEmulatorOptions {
  /** Tool name for context */
  toolName: string;
  /** Initial tool result to provide to the widget */
  toolResult: unknown;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Abstract base class for host emulators
 *
 * Host emulators simulate the host environments (Claude Desktop / ChatGPT)
 * for testing MCP Apps and OpenAI Apps widgets in headless environments.
 *
 * Subclasses implement protocol-specific behavior:
 * - MCPHostEmulator: MCP Apps JSON-RPC over postMessage protocol
 * - OpenAIHostEmulator: OpenAI Apps SDK (window.openai + DOM events)
 */
export abstract class BaseHostEmulator<TOptions extends BaseHostEmulatorOptions> {
  protected options: TOptions;
  protected toolCallHistory: TrackedToolCall[] = [];

  constructor(options: TOptions) {
    this.options = options;
  }

  /**
   * Inject the host emulator into a jsdom window
   * Protocol-specific implementation required
   */
  abstract injectIntoJSDOM(dom: JSDOMInterface): void;

  /**
   * Generate a Playwright addInitScript that emulates the host
   * Protocol-specific implementation required
   */
  abstract getPlaywrightInitScript(): string;

  /**
   * Get history of tool calls made by the widget
   * Returns a copy to prevent external modification
   */
  getToolCallHistory(): TrackedToolCall[] {
    return [...this.toolCallHistory];
  }

  /**
   * Clear tool call history
   */
  clearToolCallHistory(): void {
    this.toolCallHistory = [];
  }

  /**
   * Record a tool call from the widget
   * @internal Used by subclasses to track calls
   */
  protected recordToolCall(name: string, args: unknown): void {
    this.toolCallHistory.push({
      name,
      args,
      timestamp: Date.now(),
    });
  }
}
