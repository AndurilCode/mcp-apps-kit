/**
 * MCP Host Emulator
 *
 * Emulates Claude Desktop's ext-apps host in jsdom/Playwright environments.
 * Implements the MCP Apps JSON-RPC over postMessage protocol.
 */

/**
 * JSDOM type - minimal interface for type safety
 */
interface JSDOMInterface {
  window: Window;
}

/**
 * Options for configuring the MCP host emulator
 */
export interface MCPHostEmulatorOptions {
  /** Tool name for context */
  toolName: string;
  /** Initial tool result */
  toolResult: unknown;
  /** Handle bidirectional tool calls from widget */
  onToolCall?: (name: string, args: unknown) => Promise<unknown>;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Tracked tool call from the widget
 */
export interface TrackedToolCall {
  name: string;
  args: unknown;
  timestamp: number;
}

/**
 * MCP Host Emulator
 *
 * Emulates Claude Desktop's ext-apps host for testing MCP Apps widgets.
 * Supports injecting into jsdom or generating Playwright init scripts.
 */
export class MCPHostEmulator {
  private options: MCPHostEmulatorOptions;
  private toolCallHistory: TrackedToolCall[] = [];

  constructor(options: MCPHostEmulatorOptions) {
    this.options = options;
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

    return `
      // MCP Host Emulator for Playwright
      (function() {
        window.__mcpHostEmulator = {
          toolResult: ${toolResult},
          toolName: ${toolName},
          toolCallHistory: [],
          messageIdCounter: 1,
        };

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
                const response = {
                  jsonrpc: '2.0',
                  id: message.id,
                  result: {
                    hostCapabilities: {
                      logging: {},
                      serverTools: {},
                    },
                    hostVersion: {
                      name: 'MCP Inspector Emulator',
                      version: '1.0.0',
                    },
                    hostContext: {
                      theme: 'light',
                      displayMode: 'inline',
                      availableDisplayModes: ['inline', 'fullscreen'],
                      viewport: { width: 800, height: 600 },
                      locale: 'en-US',
                      timeZone: 'UTC',
                      toolInfo: {
                        tool: {
                          name: ${toolName},
                        },
                      },
                    },
                  },
                };

                // Dispatch response message event
                // Use source: window (in top-level page, window.parent === window, but our mock isn't a real Window)
                // ext-apps SDK checks event.source === window.parent, which equals window in top-level context
                window.dispatchEvent(new MessageEvent('message', {
                  data: response,
                  origin: '*',
                  source: window,
                }));
                console.log('[MCP Host Emulator] Sent ui/initialize response');

                // Then send the tool result after a longer delay to ensure widget is ready
                setTimeout(function() {
                  console.log('[MCP Host Emulator] Sending tool/result...');
                  var resultMessage = {
                    jsonrpc: '2.0',
                    method: 'tool/result',
                    params: {
                      result: {
                        structuredContent: ${toolResult},
                        content: [{ type: 'text', text: JSON.stringify(${toolResult}) }],
                      },
                    },
                  };
                  window.dispatchEvent(new MessageEvent('message', {
                    data: resultMessage,
                    origin: '*',
                    source: window,
                  }));
                }, 100);
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
          hostCapabilities: {
            logging: {},
            serverTools: {},
          },
          hostVersion: {
            name: "MCP Inspector Emulator",
            version: "1.0.0",
          },
          hostContext: this.buildHostContext(),
        });
        break;

      case "tools/call":
        // Handle bidirectional tool call
        if (msg.params) {
          const name = msg.params.name as string;
          const args = msg.params.arguments ?? {};

          this.toolCallHistory.push({
            name,
            args,
            timestamp: Date.now(),
          });

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

      default:
        if (debug) {
          // eslint-disable-next-line no-console
          console.log("[MCP Host] Unhandled method:", msg.method);
        }
    }
  }

  /**
   * Build host context object
   */
  private buildHostContext(): Record<string, unknown> {
    return {
      theme: "light",
      displayMode: "inline",
      availableDisplayModes: ["inline", "fullscreen"],
      viewport: { width: 800, height: 600 },
      locale: "en-US",
      timeZone: "UTC",
      toolInfo: {
        tool: {
          name: this.options.toolName,
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
   */
  private emitToolResult(window: Window, result: unknown): void {
    this.sendNotification(window, "tool/result", {
      result: {
        structuredContent: result,
        content: [{ type: "text", text: JSON.stringify(result) }],
      },
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
   * Get history of tool calls made by the widget
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
   * Update the tool result and notify the widget
   */
  updateToolResult(window: Window, result: unknown): void {
    this.emitToolResult(window, result);
  }
}
