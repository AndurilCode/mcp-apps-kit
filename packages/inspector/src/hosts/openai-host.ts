/**
 * OpenAI Host Emulator
 *
 * Emulates ChatGPT's sandboxed widget environment in jsdom/Playwright.
 * Implements the OpenAI Apps SDK protocol (window.openai + DOM events).
 */

/**
 * JSDOM type - minimal interface for type safety
 * Using a permissive type to accommodate jsdom's DOMWindow
 */
interface JSDOMInterface {
  window: Window;
}

/**
 * Environment settings for the emulator
 */
export interface OpenAIEnvironmentSettings {
  theme?: "light" | "dark";
  locale?: string;
  displayMode?: "inline" | "fullscreen" | "pip";
  viewport?: { width: number; height: number };
  maxHeight?: number;
  safeAreaInsets?: { top: number; right: number; bottom: number; left: number };
  userAgent?: { device?: { type?: string }; capabilities?: { hover?: boolean; touch?: boolean } };
  userLocation?: { city?: string; region?: string; country?: string; timezone?: string };
}

/**
 * Options for configuring the OpenAI host emulator
 */
export interface OpenAIHostEmulatorOptions {
  /** Tool name */
  toolName: string;
  /** Tool result (will be JSON stringified for toolOutput) */
  toolResult: unknown;
  /** Initial widget state */
  initialState?: unknown;
  /** Environment settings (theme, locale, device, location, etc.) */
  environment?: OpenAIEnvironmentSettings;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Tracked state change
 */
export interface TrackedStateChange {
  state: unknown;
  timestamp: number;
}

/**
 * Tracked tool call
 */
export interface TrackedToolCall {
  name: string;
  args: unknown;
  timestamp: number;
}

/**
 * OpenAI Host Emulator
 *
 * Emulates ChatGPT's sandboxed environment for testing OpenAI Apps widgets.
 * Supports injecting into jsdom or generating Playwright init scripts.
 */
export class OpenAIHostEmulator {
  private options: OpenAIHostEmulatorOptions;
  private state: unknown;
  private stateChanges: TrackedStateChange[] = [];
  private toolCalls: TrackedToolCall[] = [];

  constructor(options: OpenAIHostEmulatorOptions) {
    this.options = options;
    this.state = options.initialState ?? null;
  }

  /**
   * Inject the host emulator into a jsdom window
   */
  injectIntoJSDOM(dom: JSDOMInterface): void {
    const win = dom.window as Window & typeof globalThis;
    const debug = this.options.debug ?? false;

    // Create the window.openai SDK mock
    const openaiSDK = this.createOpenAISDKForWindow(debug);

    // Define window.openai
    Object.defineProperty(win, "openai", {
      value: openaiSDK,
      writable: true,
      configurable: true,
    });

    // Dispatch initial openai:set_globals event after a brief delay
    // This simulates the host setting up globals when the widget loads
    setTimeout(() => {
      this.dispatchSetGlobals(win);
    }, 10);
  }

  /**
   * Generate a Playwright addInitScript that emulates the OpenAI host
   */
  getPlaywrightInitScript(): string {
    const toolResult = JSON.stringify(this.options.toolResult);
    const toolName = JSON.stringify(this.options.toolName);
    const initialState = JSON.stringify(this.state);
    const env = this.options.environment ?? {};
    const theme = JSON.stringify(env.theme ?? "light");
    const displayMode = JSON.stringify(env.displayMode ?? "inline");
    const locale = JSON.stringify(env.locale ?? "en-US");
    const maxHeight = env.maxHeight ?? null;
    const safeArea = JSON.stringify(env.safeAreaInsets ?? { top: 0, right: 0, bottom: 0, left: 0 });
    const userAgent = JSON.stringify(
      env.userAgent ?? { device: { type: "desktop" }, capabilities: { hover: true, touch: false } }
    );
    const userLocation = env.userLocation ? JSON.stringify(env.userLocation) : "undefined";

    return `
      // OpenAI Host Emulator for Playwright
      (function() {
        // Emulator state
        window.__openaiEmulator = {
          state: ${initialState},
          stateChanges: [],
          toolCalls: [],
          toolOutput: ${toolResult},
          toolName: ${toolName},
        };

        // Create the window.openai SDK mock
        window.openai = {
          // Tool output as JSON string (ChatGPT convention)
          toolOutput: JSON.stringify(${toolResult}),

          // Get tool output as parsed object
          getToolOutput: function() {
            return JSON.stringify(${toolResult});
          },

          // Tool metadata
          toolResponseMetadata: {
            toolName: ${toolName},
          },

          // Context properties
          theme: ${theme},
          displayMode: ${displayMode},
          locale: ${locale},
          maxHeight: ${maxHeight},
          safeArea: ${safeArea},
          userAgent: ${userAgent},
          userLocation: ${userLocation},

          // State management
          getState: function() {
            return window.__openaiEmulator.state;
          },

          setState: function(state) {
            window.__openaiEmulator.state = state;
            window.__openaiEmulator.stateChanges.push({
              state: state,
              timestamp: Date.now(),
            });
          },

          setWidgetState: function(state) {
            this.setState(state);
          },

          // Tool calls
          callTool: async function(name, args) {
            window.__openaiEmulator.toolCalls.push({
              name: name,
              args: args,
              timestamp: Date.now(),
            });
            return { output: '{"mock": true}' };
          },

          // Height notifications
          notifyIntrinsicHeight: function(height) {
            // No-op for emulator
          },

          // Display mode
          requestDisplayMode: async function(opts) {
            return { mode: opts.mode };
          },

          // Links
          openExternal: async function(opts) {
            // No-op for emulator
          },

          // Close
          close: function() {
            // No-op for emulator
          },

          // File operations (stubbed)
          uploadFile: async function(file) {
            return { fileId: 'mock-file-id' };
          },

          getFileDownloadUrl: async function(fileId) {
            return { downloadUrl: 'https://example.com/mock-download' };
          },

          // Follow-up messages
          sendFollowUpMessage: async function(opts) {
            // No-op for emulator
          },
        };

        // Dispatch initial set_globals event
        setTimeout(function() {
          window.dispatchEvent(new CustomEvent('openai:set_globals', {
            detail: {
              globals: {
                toolOutput: ${toolResult},
                toolResponseMetadata: { toolName: ${toolName} },
                theme: ${theme},
                displayMode: ${displayMode},
                locale: ${locale},
                maxHeight: ${maxHeight},
                safeArea: ${safeArea},
                userAgent: ${userAgent},
                userLocation: ${userLocation},
              },
            },
          }));
        }, 10);
      })();
    `;
  }

  /**
   * Create the window.openai SDK mock object for injection into window
   */
  private createOpenAISDKForWindow(debug: boolean): Record<string, unknown> {
    const toolOutputStr = JSON.stringify(this.options.toolResult);
    const env = this.options.environment ?? {};

    return {
      // Tool output as JSON string (ChatGPT convention)
      toolOutput: toolOutputStr,

      // Get tool output as JSON string
      getToolOutput: () => toolOutputStr,

      // Tool metadata
      toolResponseMetadata: {
        toolName: this.options.toolName,
      },

      // Context properties
      theme: env.theme ?? "light",
      displayMode: env.displayMode ?? "inline",
      locale: env.locale ?? "en-US",
      maxHeight: env.maxHeight ?? null,
      safeArea: env.safeAreaInsets ?? { top: 0, right: 0, bottom: 0, left: 0 },
      userAgent: env.userAgent ?? {
        device: { type: "desktop" },
        capabilities: { hover: true, touch: false },
      },
      userLocation: env.userLocation,

      // State management (arrow functions preserve 'this' binding)
      getState: () => this.state,

      setState: (state: unknown) => {
        this.state = state;
        this.stateChanges.push({
          state,
          timestamp: Date.now(),
        });
        if (debug) {
          // eslint-disable-next-line no-console
          console.log("[OpenAI Host] setState called:", state);
        }
      },

      setWidgetState(this: { setState: (s: unknown) => void }, state: unknown) {
        this.setState(state);
      },

      // Tool calls
      callTool: async (name: string, args: unknown) => {
        this.toolCalls.push({
          name,
          args,
          timestamp: Date.now(),
        });
        if (debug) {
          // eslint-disable-next-line no-console
          console.log("[OpenAI Host] callTool:", name, args);
        }
        return { output: JSON.stringify({ mock: true }) };
      },

      // Height notifications
      notifyIntrinsicHeight: (_height: number) => {
        // No-op for emulator
      },

      // Display mode
      requestDisplayMode: async (opts: { mode: string }) => {
        return { mode: opts.mode };
      },

      // Links
      openExternal: async (_opts: { href: string }) => {
        // No-op for emulator
      },

      // Close
      close: () => {
        // No-op for emulator
      },

      // File operations (stubbed)
      uploadFile: async (_file: File) => {
        return { fileId: "mock-file-id" };
      },

      getFileDownloadUrl: async (_fileId: string) => {
        return { downloadUrl: "https://example.com/mock-download" };
      },

      // Follow-up messages
      sendFollowUpMessage: async (_opts: { prompt: string }) => {
        // No-op for emulator
      },
    };
  }

  /**
   * Dispatch openai:set_globals custom event
   * Uses the window's CustomEvent constructor for jsdom compatibility
   */
  private dispatchSetGlobals(win: Window): void {
    const env = this.options.environment ?? {};
    // Use the window's CustomEvent constructor for jsdom compatibility
    const CustomEventCtor = (win as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent;
    const event = new CustomEventCtor("openai:set_globals", {
      detail: {
        globals: {
          toolOutput: this.options.toolResult,
          toolResponseMetadata: { toolName: this.options.toolName },
          theme: env.theme ?? "light",
          displayMode: env.displayMode ?? "inline",
          locale: env.locale ?? "en-US",
          maxHeight: env.maxHeight,
          safeArea: env.safeAreaInsets,
          userAgent: env.userAgent,
          userLocation: env.userLocation,
        },
      },
    });
    win.dispatchEvent(event);
  }

  /**
   * Update tool output and notify the widget
   */
  updateToolOutput(win: Window, result: unknown): void {
    // Update the SDK property
    const openai = (win as unknown as { openai?: Record<string, unknown> }).openai;
    if (openai) {
      openai.toolOutput = JSON.stringify(result);
      openai.getToolOutput = () => JSON.stringify(result);
    }

    // Use the window's CustomEvent constructor for jsdom compatibility
    const CustomEventCtor = (win as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent;
    const event = new CustomEventCtor("openai:set_globals", {
      detail: {
        globals: {
          toolOutput: result,
        },
      },
    });
    win.dispatchEvent(event);
  }

  /**
   * Update theme and notify the widget
   */
  updateTheme(win: Window, theme: "light" | "dark"): void {
    // Update the SDK property
    const openai = (win as unknown as { openai?: Record<string, unknown> }).openai;
    if (openai) {
      openai.theme = theme;
    }

    // Use the window's CustomEvent constructor for jsdom compatibility
    const CustomEventCtor = (win as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent;
    const event = new CustomEventCtor("openai:set_globals", {
      detail: {
        globals: { theme },
      },
    });
    win.dispatchEvent(event);
  }

  /**
   * Get history of state changes
   */
  getStateChanges(): TrackedStateChange[] {
    return [...this.stateChanges];
  }

  /**
   * Get history of tool calls made by the widget
   */
  getToolCalls(): TrackedToolCall[] {
    return [...this.toolCalls];
  }

  /**
   * Get current state
   */
  getState(): unknown {
    return this.state;
  }

  /**
   * Clear tracking history
   */
  clearHistory(): void {
    this.stateChanges = [];
    this.toolCalls = [];
  }
}
