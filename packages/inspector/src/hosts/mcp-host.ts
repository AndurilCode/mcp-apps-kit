/**
 * MCP Host Emulator
 *
 * Emulates Claude Desktop's ext-apps host in jsdom/Playwright environments.
 * Implements the MCP Apps JSON-RPC over postMessage protocol.
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
  type DisplayMode,
  type DisplayModePlatform,
} from "../types/environment-types";

// Re-export shared types for backwards compatibility
export type { TrackedToolCall };

/**
 * Environment settings for the emulator
 */
export interface MCPEnvironmentSettings {
  theme?: "light" | "dark";
  locale?: string;
  timeZone?: string;
  displayMode?: "inline" | "fullscreen" | "pip";
  viewport?: { width: number; height: number };
  maxHeight?: number;
  platform?: "web" | "desktop" | "mobile";
}

/**
 * Options for configuring the MCP host emulator
 */
export interface MCPHostEmulatorOptions extends BaseHostEmulatorOptions {
  /** Handle bidirectional tool calls from widget */
  onToolCall?: (name: string, args: unknown) => Promise<unknown>;
  /** Environment settings (theme, locale, viewport, etc.) */
  environment?: MCPEnvironmentSettings;
}

/**
 * MCP Host Emulator
 *
 * Emulates Claude Desktop's ext-apps host for testing MCP Apps widgets.
 * Supports injecting into jsdom or generating Playwright init scripts.
 */
export class MCPHostEmulator extends BaseHostEmulator<MCPHostEmulatorOptions> {
  /** Mutable display mode state (updated by requestDisplayMode) */
  private currentDisplayMode: DisplayMode;
  /** Mutable viewport state (updated by requestDisplayMode) */
  private currentViewport: { width: number; height: number };
  /** Current platform for sizing calculations */
  private platform: DisplayModePlatform;

  constructor(options: MCPHostEmulatorOptions) {
    super(options);
    const env = options.environment ?? {};

    // Determine platform from environment settings
    this.platform = this.determinePlatform(env.platform);

    // Initialize display mode and viewport with presets
    this.currentDisplayMode = env.displayMode ?? "inline";
    const sizing = getDisplayModeSizing(this.currentDisplayMode, this.platform);
    this.currentViewport = env.viewport ?? { width: sizing.width, height: sizing.height };
  }

  /**
   * Determine platform from environment setting
   */
  private determinePlatform(platform?: "web" | "desktop" | "mobile"): DisplayModePlatform {
    if (platform === "mobile") {
      return "mobile";
    }
    return "desktop";
  }

  /**
   * Inject the host emulator into a jsdom window
   */
  injectIntoJSDOM(dom: JSDOMInterface): void {
    const win = dom.window;
    const debug = this.options.debug ?? false;

    // Mock window.parent.postMessage for ext-apps JSON-RPC
    // The widget sends messages to parent, we intercept and respond
    // Using arrow function to preserve 'this' binding
    Object.defineProperty(win, "parent", {
      value: {
        postMessage: (message: unknown, _targetOrigin: string) => {
          if (debug) {
            // eslint-disable-next-line no-console
            console.log("[MCP Host] Received postMessage:", JSON.stringify(message, null, 2));
          }
          this.handlePostMessage(message, win);
        },
      },
      writable: true,
      configurable: true,
    });

    // Set up listener for when the widget is ready to receive messages
    // Typically the widget will call ui/initialize first
    // For testing, we emit the tool result after a brief delay
    setTimeout(() => {
      this.emitHostContext(win);
      this.emitToolResult(win, this.options.toolResult);
    }, 10);
  }

  /**
   * Generate a Playwright addInitScript that emulates the MCP host
   */
  getPlaywrightInitScript(): string {
    const toolResult = JSON.stringify(this.options.toolResult);
    const toolName = JSON.stringify(this.options.toolName);
    const env = this.options.environment ?? {};
    const theme = JSON.stringify(env.theme ?? "light");
    const initialDisplayMode = env.displayMode ?? "inline";
    const displayMode = JSON.stringify(initialDisplayMode);
    const locale = JSON.stringify(env.locale ?? "en-US");
    const timeZone = JSON.stringify(env.timeZone ?? "UTC");
    const platform = JSON.stringify(env.platform ?? "desktop");

    // Calculate initial sizing
    const initialPlatform = this.determinePlatform(env.platform);
    const typedDisplayMode: DisplayMode = initialDisplayMode;
    const initialSizing = getDisplayModeSizing(typedDisplayMode, initialPlatform);
    const viewport = env.viewport ?? { width: initialSizing.width, height: initialSizing.height };

    // Stringify display mode sizes for Playwright
    const displayModeSizesJson = JSON.stringify(DISPLAY_MODE_SIZES);

    return `
      // MCP Host Emulator for Playwright
      (function() {
        // Display mode size presets
        var DISPLAY_MODE_SIZES = ${displayModeSizesJson};

        // Helper to get platform for sizing
        function getSizingPlatform(platform) {
          if (platform === 'mobile') {
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

        window.__mcpHostEmulator = {
          toolResult: ${toolResult},
          toolName: ${toolName},
          toolCallHistory: [],
          messageIdCounter: 1,
          // Mutable state for display mode
          displayMode: ${displayMode},
          viewport: ${JSON.stringify(viewport)},
          platform: ${platform},
        };

        // Helper to build current host context
        function buildHostContext() {
          var emu = window.__mcpHostEmulator;
          return {
            theme: ${theme},
            displayMode: emu.displayMode,
            availableDisplayModes: ['inline', 'fullscreen', 'pip'],
            locale: ${locale},
            timeZone: ${timeZone},
            platform: emu.platform,
            viewport: emu.viewport,
            containerDimensions: emu.viewport,
            toolInfo: {
              tool: {
                name: emu.toolName,
                inputSchema: { type: 'object' },
              },
            },
          };
        }

        // Track messages sent by the widget
        window.__mcpPostMessages = [];

        // Mock window.parent.postMessage
        Object.defineProperty(window, 'parent', {
          value: {
            postMessage: function(message, targetOrigin) {
              window.__mcpPostMessages.push({
                message: message,
                targetOrigin: targetOrigin,
                timestamp: Date.now(),
              });

              // Handle ui/initialize request
              if (message && message.jsonrpc === '2.0' && message.method === 'ui/initialize') {
                console.log('[MCP Host Emulator] Received ui/initialize, responding...');
                // Respond with initialization success
                var response = {
                  jsonrpc: '2.0',
                  id: message.id,
                  result: {
                    protocolVersion: '2025-11-21',
                    hostInfo: {
                      name: 'MCP Inspector Emulator',
                      version: '1.0.0',
                    },
                    hostCapabilities: {
                      logging: {},
                      serverTools: {},
                    },
                    hostContext: buildHostContext(),
                  },
                };

                // Dispatch response message event
                window.dispatchEvent(new MessageEvent('message', {
                  data: response,
                  origin: '*',
                  source: window,
                }));
                console.log('[MCP Host Emulator] Sent ui/initialize response');

                // Then send the tool result after a longer delay to ensure widget is ready
                setTimeout(function() {
                  console.log('[MCP Host Emulator] Sending ui/notifications/tool-result...');
                  var resultMessage = {
                    jsonrpc: '2.0',
                    method: 'ui/notifications/tool-result',
                    params: {
                      structuredContent: ${toolResult},
                      content: [{ type: 'text', text: JSON.stringify(${toolResult}) }],
                    },
                  };
                  window.dispatchEvent(new MessageEvent('message', {
                    data: resultMessage,
                    origin: '*',
                    source: window,
                  }));
                }, 100);
              }

              // Handle ui/requests/display-mode request
              if (message && message.jsonrpc === '2.0' && message.method === 'ui/requests/display-mode') {
                var requestedMode = message.params && message.params.mode;
                if (requestedMode) {
                  var emu = window.__mcpHostEmulator;
                  var sizingPlatform = getSizingPlatform(emu.platform);
                  var sizing = getDisplayModeSizing(requestedMode, sizingPlatform);

                  // Update emulator state
                  emu.displayMode = requestedMode;
                  emu.viewport = { width: sizing.width, height: sizing.height };

                  console.log('[MCP Host Emulator] Display mode changed to:', requestedMode, 'sizing:', sizing);

                  // Send response
                  var displayModeResponse = {
                    jsonrpc: '2.0',
                    id: message.id,
                    result: { mode: requestedMode },
                  };
                  window.dispatchEvent(new MessageEvent('message', {
                    data: displayModeResponse,
                    origin: '*',
                    source: window,
                  }));

                  // Send host context changed notification
                  var contextChanged = {
                    jsonrpc: '2.0',
                    method: 'ui/notifications/host-context-changed',
                    params: { hostContext: buildHostContext() },
                  };
                  window.dispatchEvent(new MessageEvent('message', {
                    data: contextChanged,
                    origin: '*',
                    source: window,
                  }));
                }
              }

              // Handle tool call requests
              if (message && message.jsonrpc === '2.0' && message.method === 'tools/call') {
                window.__mcpHostEmulator.toolCallHistory.push({
                  name: message.params.name,
                  args: message.params.arguments,
                  timestamp: Date.now(),
                });

                // Respond with mock result
                var callResponse = {
                  jsonrpc: '2.0',
                  id: message.id,
                  result: {
                    content: [{ type: 'text', text: '{"mock": true}' }],
                  },
                };
                window.dispatchEvent(new MessageEvent('message', {
                  data: callResponse,
                  origin: '*',
                  source: window,
                }));
              }
            },
          },
          writable: true,
          configurable: true,
        });
      })();
    `;
  }

  /**
   * Handle a postMessage from the widget
   */
  private handlePostMessage(message: unknown, window: Window): void {
    if (!message || typeof message !== "object") return;

    const msg = message as {
      jsonrpc?: string;
      id?: number | string;
      method?: string;
      params?: Record<string, unknown>;
    };

    if (msg.jsonrpc !== "2.0") return;

    const debug = this.options.debug ?? false;

    switch (msg.method) {
      case "ui/initialize":
        // Respond with initialization success
        this.sendResponse(window, msg.id, {
          protocolVersion: "2025-11-21",
          hostInfo: {
            name: "MCP Inspector Emulator",
            version: "1.0.0",
          },
          hostCapabilities: {
            logging: {},
            serverTools: {},
          },
          hostContext: this.buildHostContext(),
        });
        break;

      case "tools/call":
        // Handle bidirectional tool call
        if (msg.params) {
          const name = msg.params.name as string;
          const args = msg.params.arguments ?? {};

          this.recordToolCall(name, args);

          if (this.options.onToolCall) {
            void this.options
              .onToolCall(name, args)
              .then((result) => {
                this.sendResponse(window, msg.id, {
                  content: [{ type: "text", text: JSON.stringify(result) }],
                });
              })
              .catch((error: unknown) => {
                const message = error instanceof Error ? error.message : String(error);
                this.sendError(window, msg.id, -32000, message);
              });
          } else {
            // Return mock result
            this.sendResponse(window, msg.id, {
              content: [{ type: "text", text: '{"mock": true}' }],
            });
          }
        }
        break;

      case "logging/sendMessage":
        // Handle logging from widget
        if (debug && msg.params) {
          // eslint-disable-next-line no-console
          console.log("[MCP Widget Log]", msg.params.level, msg.params.data);
        }
        break;

      case "ui/requests/display-mode":
        // Handle display mode change request from widget
        if (msg.params) {
          const requestedMode = msg.params.mode as DisplayMode;
          this.handleDisplayModeRequest(window, msg.id, requestedMode, debug);
        }
        break;

      default:
        if (debug) {
          // eslint-disable-next-line no-console
          console.log("[MCP Host] Unhandled method:", msg.method);
        }
    }
  }

  /**
   * Handle display mode change request
   * Updates internal state and notifies widget of new host context
   */
  private handleDisplayModeRequest(
    window: Window,
    messageId: number | string | undefined,
    mode: DisplayMode,
    debug: boolean
  ): void {
    // Calculate new sizing based on mode and platform
    const sizing = getDisplayModeSizing(mode, this.platform);

    // Update internal state
    this.currentDisplayMode = mode;
    this.currentViewport = { width: sizing.width, height: sizing.height };

    if (debug) {
      // eslint-disable-next-line no-console
      console.log("[MCP Host] Display mode changed to:", mode, "sizing:", sizing);
    }

    // Send response with granted mode
    this.sendResponse(window, messageId, { mode });

    // Send host context changed notification with updated sizing
    this.sendNotification(window, "ui/notifications/host-context-changed", {
      hostContext: this.buildHostContext(),
    });
  }

  /**
   * Build host context object
   * Uses mutable state for displayMode and viewport (updated by requestDisplayMode)
   */
  private buildHostContext(): Record<string, unknown> {
    const env = this.options.environment ?? {};
    return {
      theme: env.theme ?? "light",
      displayMode: this.currentDisplayMode,
      availableDisplayModes: ["inline", "fullscreen", "pip"],
      locale: env.locale ?? "en-US",
      timeZone: env.timeZone ?? "UTC",
      platform: env.platform ?? "desktop",
      viewport: this.currentViewport,
      containerDimensions: this.currentViewport,
      toolInfo: {
        tool: {
          name: this.options.toolName,
          inputSchema: { type: "object" },
        },
      },
    };
  }

  /**
   * Emit host context update to the widget
   */
  private emitHostContext(window: Window): void {
    this.sendNotification(window, "hostContext/changed", {
      hostContext: this.buildHostContext(),
    });
  }

  /**
   * Emit tool result to the widget
   * Method: 'ui/notifications/tool-result', params: CallToolResult (not wrapped in 'result')
   */
  private emitToolResult(window: Window, result: unknown): void {
    this.sendNotification(window, "ui/notifications/tool-result", {
      structuredContent: result,
      content: [{ type: "text", text: JSON.stringify(result) }],
    });
  }

  /**
   * Send a JSON-RPC response
   */
  private sendResponse(window: Window, id: number | string | undefined, result: unknown): void {
    const message = {
      jsonrpc: "2.0",
      id,
      result,
    };

    this.dispatchMessage(window, message);
  }

  /**
   * Send a JSON-RPC error
   */
  private sendError(
    window: Window,
    id: number | string | undefined,
    code: number,
    message: string
  ): void {
    const errorMsg = {
      jsonrpc: "2.0",
      id,
      error: {
        code,
        message,
      },
    };

    this.dispatchMessage(window, errorMsg);
  }

  /**
   * Send a JSON-RPC notification (no id)
   */
  private sendNotification(window: Window, method: string, params: unknown): void {
    const message = {
      jsonrpc: "2.0",
      method,
      params,
    };

    this.dispatchMessage(window, message);
  }

  /**
   * Dispatch a message event to the window
   * Uses the window's MessageEvent constructor for jsdom compatibility
   */
  private dispatchMessage(window: Window, message: unknown): void {
    // Use the window's MessageEvent constructor for jsdom compatibility
    const MessageEventCtor = (window as unknown as { MessageEvent: typeof MessageEvent })
      .MessageEvent;
    // Include source: window.parent so ext-apps SDK accepts the message
    // (SDK checks event.source === window.parent)
    const parentWindow = (window as { parent?: unknown }).parent;
    const event = new MessageEventCtor("message", {
      data: message,
      origin: "*",
      source: parentWindow as Window,
    });
    window.dispatchEvent(event);
  }

  /**
   * Update the tool result and notify the widget
   */
  updateToolResult(window: Window, result: unknown): void {
    this.emitToolResult(window, result);
  }
}
