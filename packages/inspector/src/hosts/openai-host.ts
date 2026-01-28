/**
 * OpenAI Host Emulator
 *
 * Emulates ChatGPT's sandboxed widget environment in jsdom/Playwright.
 * Implements the OpenAI Apps SDK protocol (window.openai + DOM events).
 */

import {
  BaseHostEmulator,
  type JSDOMInterface,
  type TrackedToolCall,
  type BaseHostEmulatorOptions,
} from "./base-host";
import {
  DISPLAY_MODE_SIZES,
  getDisplayModeSizing,
  getPlatformFromDeviceType,
  type DisplayMode,
} from "../types/environment-types";

// Re-export shared types for backwards compatibility
export type { TrackedToolCall };

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
export interface OpenAIHostEmulatorOptions extends BaseHostEmulatorOptions {
  /** Initial widget state */
  initialState?: unknown;
  /** Environment settings (theme, locale, device, location, etc.) */
  environment?: OpenAIEnvironmentSettings;
}

/**
 * Tracked state change
 */
export interface TrackedStateChange {
  state: unknown;
  timestamp: number;
}

/**
 * OpenAI Host Emulator
 *
 * Emulates ChatGPT's sandboxed environment for testing OpenAI Apps widgets.
 * Supports injecting into jsdom or generating Playwright init scripts.
 */
export class OpenAIHostEmulator extends BaseHostEmulator<OpenAIHostEmulatorOptions> {
  private state: unknown;
  private stateChanges: TrackedStateChange[] = [];

  constructor(options: OpenAIHostEmulatorOptions) {
    super(options);
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
    const initialDisplayMode = env.displayMode ?? "inline";
    const displayMode = JSON.stringify(initialDisplayMode);
    const locale = JSON.stringify(env.locale ?? "en-US");
    const safeArea = JSON.stringify(env.safeAreaInsets ?? { top: 0, right: 0, bottom: 0, left: 0 });
    const userAgentObj = env.userAgent ?? {
      device: { type: "desktop" },
      capabilities: { hover: true, touch: false },
    };
    const userAgent = JSON.stringify(userAgentObj);
    const userLocation = env.userLocation ? JSON.stringify(env.userLocation) : "undefined";

    // Calculate initial sizing based on display mode and platform
    const platform = getPlatformFromDeviceType(userAgentObj.device?.type);
    const typedInitialDisplayMode: DisplayMode = initialDisplayMode;
    const initialSizing = getDisplayModeSizing(typedInitialDisplayMode, platform);
    const maxHeight = env.maxHeight ?? initialSizing.maxHeight;
    const viewport = env.viewport ?? { width: initialSizing.width, height: initialSizing.height };

    // Stringify the display mode sizes constant for use in Playwright
    const displayModeSizesJson = JSON.stringify(DISPLAY_MODE_SIZES);

    return `
      // OpenAI Host Emulator for Playwright
      (function() {
        // Display mode size presets
        var DISPLAY_MODE_SIZES = ${displayModeSizesJson};

        // Helper to get platform from device type
        function getPlatformFromDeviceType(deviceType) {
          if (deviceType === 'mobile' || deviceType === 'tablet') {
            return 'mobile';
          }
          return 'desktop';
        }

        // Helper to get sizing for display mode
        function getDisplayModeSizing(mode, platform) {
          platform = platform || 'desktop';
          var sizes = DISPLAY_MODE_SIZES[platform] || DISPLAY_MODE_SIZES.desktop;
          return sizes[mode] || sizes.inline;
        }

        // Emulator state (includes mutable sizing state)
        window.__openaiEmulator = {
          state: ${initialState},
          stateChanges: [],
          toolCalls: [],
          toolOutput: ${toolResult},
          toolName: ${toolName},
          // Mutable sizing state
          displayMode: ${displayMode},
          maxHeight: ${maxHeight ?? "null"},
          viewport: ${JSON.stringify(viewport)},
          userAgent: ${userAgent},
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

          // Context properties (use getters for dynamic values)
          theme: ${theme},
          get displayMode() {
            return window.__openaiEmulator.displayMode;
          },
          locale: ${locale},
          get maxHeight() {
            return window.__openaiEmulator.maxHeight;
          },
          safeArea: ${safeArea},
          get userAgent() {
            return window.__openaiEmulator.userAgent;
          },
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

          // Display mode - updates sizing and dispatches set_globals
          requestDisplayMode: async function(opts) {
            var mode = opts.mode;
            var deviceType = window.__openaiEmulator.userAgent?.device?.type;
            var platform = getPlatformFromDeviceType(deviceType);
            var sizing = getDisplayModeSizing(mode, platform);

            // Update emulator state
            window.__openaiEmulator.displayMode = mode;
            window.__openaiEmulator.maxHeight = sizing.maxHeight;
            window.__openaiEmulator.viewport = { width: sizing.width, height: sizing.height };

            // Dispatch set_globals event with updated sizing
            window.dispatchEvent(new CustomEvent('openai:set_globals', {
              detail: {
                globals: {
                  displayMode: mode,
                  maxHeight: sizing.maxHeight,
                  viewport: window.__openaiEmulator.viewport,
                },
              },
            }));

            console.log('[OpenAI Host] requestDisplayMode:', mode, 'sizing:', sizing);
            return { mode: mode };
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
                displayMode: window.__openaiEmulator.displayMode,
                locale: ${locale},
                maxHeight: window.__openaiEmulator.maxHeight,
                safeArea: ${safeArea},
                userAgent: window.__openaiEmulator.userAgent,
                userLocation: ${userLocation},
                viewport: window.__openaiEmulator.viewport,
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

    // Store initial sizing for display mode calculations
    const initialUserAgent = env.userAgent ?? {
      device: { type: "desktop" },
      capabilities: { hover: true, touch: false },
    };
    const platform = getPlatformFromDeviceType(initialUserAgent.device?.type);
    const initialDisplayMode: DisplayMode = env.displayMode ?? "inline";
    const initialSizing = getDisplayModeSizing(initialDisplayMode, platform);

    // Create mutable state object that requestDisplayMode and updateTheme can update
    const sdkState: {
      theme: "light" | "dark";
      displayMode: DisplayMode;
      maxHeight: number | null;
      viewport: { width: number; height: number };
      userAgent: typeof initialUserAgent;
    } = {
      theme: env.theme ?? "light",
      displayMode: initialDisplayMode,
      maxHeight: env.maxHeight ?? initialSizing.maxHeight,
      viewport: env.viewport ?? { width: initialSizing.width, height: initialSizing.height },
      userAgent: initialUserAgent,
    };

    // Helper to dispatch set_globals event (stored for use in requestDisplayMode)
    const dispatchGlobalsUpdate = (
      win: Window,
      globals: Record<string, unknown>,
      debugMode: boolean
    ) => {
      const CustomEventCtor = (win as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent;
      const event = new CustomEventCtor("openai:set_globals", {
        detail: { globals },
      });
      win.dispatchEvent(event);
      if (debugMode) {
        // eslint-disable-next-line no-console
        console.log("[OpenAI Host] Dispatched set_globals:", globals);
      }
    };

    return {
      // Tool output as JSON string (ChatGPT convention)
      toolOutput: toolOutputStr,

      // Get tool output as JSON string
      getToolOutput: () => toolOutputStr,

      // Tool metadata
      toolResponseMetadata: {
        toolName: this.options.toolName,
      },

      // Context properties (getters/setters for mutable state, static for others)
      get theme() {
        return sdkState.theme;
      },
      set theme(value: "light" | "dark") {
        sdkState.theme = value;
      },
      get displayMode() {
        return sdkState.displayMode;
      },
      locale: env.locale ?? "en-US",
      get maxHeight() {
        return sdkState.maxHeight;
      },
      safeArea: env.safeAreaInsets ?? { top: 0, right: 0, bottom: 0, left: 0 },
      get userAgent() {
        return sdkState.userAgent;
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
        this.recordToolCall(name, args);
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

      // Display mode - updates sizing and dispatches set_globals
      requestDisplayMode: async function (
        this: { dispatchGlobals?: (globals: Record<string, unknown>) => void },
        opts: { mode: string }
      ) {
        const mode = opts.mode as DisplayMode;
        const deviceType = sdkState.userAgent?.device?.type;
        const plat = getPlatformFromDeviceType(deviceType);
        const sizing = getDisplayModeSizing(mode, plat);

        // Update SDK state
        sdkState.displayMode = mode;
        sdkState.maxHeight = sizing.maxHeight;
        sdkState.viewport = { width: sizing.width, height: sizing.height };

        // Dispatch set_globals event with updated sizing
        // Note: In jsdom context, we need to access window from the test
        // The actual dispatch happens via the window reference
        /* eslint-disable no-undef */
        if (typeof window !== "undefined") {
          dispatchGlobalsUpdate(
            window,
            /* eslint-enable no-undef */
            {
              displayMode: mode,
              maxHeight: sizing.maxHeight,
              viewport: sdkState.viewport,
            },
            debug
          );
        }

        if (debug) {
          // eslint-disable-next-line no-console
          console.log("[OpenAI Host] requestDisplayMode:", mode, "sizing:", sizing);
        }

        return { mode };
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
   * @deprecated Use getToolCallHistory() instead (inherited from base class)
   */
  getToolCalls(): TrackedToolCall[] {
    return this.getToolCallHistory();
  }

  /**
   * Get current state
   */
  getState(): unknown {
    return this.state;
  }

  /**
   * Clear tracking history (state changes and tool calls)
   */
  clearHistory(): void {
    this.stateChanges = [];
    this.clearToolCallHistory();
  }
}
