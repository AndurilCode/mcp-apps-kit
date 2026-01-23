/**
 * Widget Server
 *
 * Lightweight HTTP server that serves widget sessions with proper iframe embedding.
 * This enables correct postMessage communication where event.source === window.parent.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

/**
 * Widget session data
 */
export interface WidgetSession {
  id: string;
  html: string;
  toolResult: unknown;
  toolName: string;
  protocol: "mcp" | "openai";
  createdAt: number;
}

/**
 * Session creation result
 */
export interface CreateSessionResult {
  sessionId: string;
  hostUrl: string;
  widgetUrl: string;
}

/**
 * WidgetServer options
 */
export interface WidgetServerOptions {
  /** Session TTL in milliseconds (default: 5 minutes) */
  sessionTTL?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Widget Server
 *
 * Serves host pages that embed widget HTML in real iframes,
 * enabling proper postMessage communication with event.source validation.
 */
export class WidgetServer {
  private server: Server | null = null;
  private sessions: Map<string, WidgetSession> = new Map();
  private port = 0;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private options: Required<WidgetServerOptions>;

  constructor(options: WidgetServerOptions = {}) {
    this.options = {
      sessionTTL: options.sessionTTL ?? 5 * 60 * 1000, // 5 minutes
      debug: options.debug ?? false,
    };
  }

  /**
   * Start the server on an ephemeral port (127.0.0.1)
   */
  async start(): Promise<number> {
    if (this.server) {
      return this.port;
    }

    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        this.handleRequest(req, res);
      });
      this.server = server;

      server.on("error", (err) => {
        reject(err);
      });

      // Listen on 127.0.0.1:0 for ephemeral port
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (address && typeof address === "object") {
          this.port = address.port;
          this.log(`Server started on http://127.0.0.1:${this.port}`);

          // Start cleanup interval
          this.cleanupInterval = setInterval(() => {
            this.cleanupStaleSessions();
          }, 60000); // Check every minute

          resolve(this.port);
        } else {
          reject(new Error("Failed to get server address"));
        }
      });
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.server) {
      const server = this.server;
      return new Promise((resolve) => {
        server.close(() => {
          this.server = null;
          this.sessions.clear();
          this.port = 0;
          this.log("Server stopped");
          resolve();
        });
      });
    }
  }

  /**
   * Create a new widget session
   */
  createSession(
    html: string,
    toolResult: unknown,
    toolName: string,
    protocol: "mcp" | "openai"
  ): CreateSessionResult {
    const sessionId = randomUUID();
    const session: WidgetSession = {
      id: sessionId,
      html,
      toolResult,
      toolName,
      protocol,
      createdAt: Date.now(),
    };

    this.sessions.set(sessionId, session);
    this.log(`Created session ${sessionId} for tool ${toolName} (${protocol})`);

    const baseUrl = `http://127.0.0.1:${this.port}`;
    return {
      sessionId,
      hostUrl: `${baseUrl}/host/${sessionId}`,
      widgetUrl: `${baseUrl}/widget/${sessionId}`,
    };
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): void {
    if (this.sessions.delete(sessionId)) {
      this.log(`Deleted session ${sessionId}`);
    }
  }

  /**
   * Get the server port
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Handle incoming HTTP requests
   */
  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url ?? "/";

    // Parse the URL path
    if (url.startsWith("/host/")) {
      const sessionId = url.slice(6); // Remove "/host/"
      this.serveHost(sessionId, res);
    } else if (url.startsWith("/widget/")) {
      const sessionId = url.slice(8); // Remove "/widget/"
      this.serveWidget(sessionId, res);
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    }
  }

  /**
   * Serve the widget HTML
   */
  private serveWidget(sessionId: string, res: ServerResponse): void {
    const session = this.sessions.get(sessionId);

    if (!session) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Session not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(session.html);
  }

  /**
   * Serve the host page that embeds the widget in an iframe
   */
  private serveHost(sessionId: string, res: ServerResponse): void {
    const session = this.sessions.get(sessionId);

    if (!session) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Session not found");
      return;
    }

    const hostHtml =
      session.protocol === "mcp"
        ? this.generateMcpHostPage(session)
        : this.generateOpenAIHostPage(session);

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(hostHtml);
  }

  /**
   * Generate MCP host page HTML
   */
  private generateMcpHostPage(session: WidgetSession): string {
    const toolResultJson = JSON.stringify(session.toolResult);
    const toolNameJson = JSON.stringify(session.toolName);
    const widgetUrl = `http://127.0.0.1:${this.port}/widget/${session.id}`;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MCP Widget Host - ${session.toolName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    iframe { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <iframe id="widget-frame" src="${widgetUrl}" sandbox="allow-scripts allow-same-origin"></iframe>
  <script>
    (function() {
      const toolResult = ${toolResultJson};
      const toolName = ${toolNameJson};
      const iframe = document.getElementById('widget-frame');
      let initialized = false;

      // Listen for messages from the widget
      window.addEventListener('message', function(event) {
        // Only accept messages from our iframe
        if (event.source !== iframe.contentWindow) return;

        const message = event.data;
        if (!message || message.jsonrpc !== '2.0') return;

        console.log('[MCP Host] Received:', JSON.stringify(message));

        // Handle ui/initialize request
        if (message.method === 'ui/initialize') {
          initialized = true;
          const response = {
            jsonrpc: '2.0',
            id: message.id,
            result: {
              protocolVersion: '2025-11-21',
              hostInfo: {
                name: 'MCP Inspector Host',
                version: '1.0.0',
              },
              hostCapabilities: {
                logging: {},
                serverTools: {},
              },
              hostContext: {
                theme: 'light',
                displayMode: 'inline',
                availableDisplayModes: ['inline', 'fullscreen'],
                locale: 'en-US',
                timeZone: 'UTC',
                toolInfo: {
                  tool: { name: toolName, inputSchema: { type: 'object' } },
                },
              },
            },
          };
          iframe.contentWindow.postMessage(response, '*');
          console.log('[MCP Host] Sent ui/initialize response');

          // Send tool result after a short delay
          // Method: 'ui/notifications/tool-result', params: CallToolResult (not wrapped in 'result')
          setTimeout(function() {
            const resultMessage = {
              jsonrpc: '2.0',
              method: 'ui/notifications/tool-result',
              params: {
                structuredContent: toolResult,
                content: [{ type: 'text', text: JSON.stringify(toolResult) }],
              },
            };
            iframe.contentWindow.postMessage(resultMessage, '*');
            console.log('[MCP Host] Sent ui/notifications/tool-result');
          }, 50);
        }

        // Handle tools/call requests (bidirectional)
        if (message.method === 'tools/call') {
          console.log('[WIDGET_TOOL_CALL] ' + JSON.stringify({
            name: message.params.name,
            args: message.params.arguments,
          }));

          // Return mock result
          const callResponse = {
            jsonrpc: '2.0',
            id: message.id,
            result: {
              content: [{ type: 'text', text: '{"mock": true}' }],
            },
          };
          iframe.contentWindow.postMessage(callResponse, '*');
        }

        // Handle logging/sendMessage
        if (message.method === 'logging/sendMessage') {
          console.log('[MCP Widget Log]', message.params.level, message.params.data);
        }
      });

      console.log('[MCP Host] Ready, waiting for widget to initialize...');
    })();
  </script>
</body>
</html>`;
  }

  /**
   * Generate OpenAI host page HTML
   */
  private generateOpenAIHostPage(session: WidgetSession): string {
    const toolResultJson = JSON.stringify(session.toolResult);
    const toolNameJson = JSON.stringify(session.toolName);
    const widgetUrl = `http://127.0.0.1:${this.port}/widget/${session.id}`;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenAI Widget Host - ${session.toolName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    iframe { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <iframe id="widget-frame" src="${widgetUrl}" sandbox="allow-scripts allow-same-origin"></iframe>
  <script>
    (function() {
      const toolResult = ${toolResultJson};
      const toolName = ${toolNameJson};
      const iframe = document.getElementById('widget-frame');

      // Listen for ready event from the widget
      window.addEventListener('message', function(event) {
        // Only accept messages from our iframe
        if (event.source !== iframe.contentWindow) return;

        const message = event.data;
        console.log('[OpenAI Host] Received:', JSON.stringify(message));

        // Handle ready event
        if (message && message.type === 'ready') {
          // Send context
          iframe.contentWindow.postMessage({
            type: 'context',
            data: {
              theme: 'light',
              displayMode: 'inline',
              locale: 'en-US',
              maxHeight: 600,
              safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
            },
          }, '*');

          // Send tool output
          iframe.contentWindow.postMessage({
            type: 'output',
            data: {
              toolOutput: JSON.stringify(toolResult),
              toolResponseMetadata: { toolName: toolName },
            },
          }, '*');

          console.log('[OpenAI Host] Sent context and output');
        }

        // Handle tool calls
        if (message && message.type === 'callTool') {
          console.log('[WIDGET_TOOL_CALL] ' + JSON.stringify({
            name: message.name,
            args: message.args,
          }));

          // Return mock result
          iframe.contentWindow.postMessage({
            type: 'callToolResult',
            id: message.id,
            result: { output: '{"mock": true}' },
          }, '*');
        }

        // Handle state changes
        if (message && message.type === 'setState') {
          console.log('[OpenAI Host] State changed:', message.state);
        }
      });

      // Also inject SDK into iframe once loaded (for widgets that use window.openai directly)
      iframe.addEventListener('load', function() {
        try {
          // Dispatch set_globals event to iframe
          const script = \`
            window.openai = {
              toolOutput: \${JSON.stringify(JSON.stringify(toolResult))},
              getToolOutput: function() { return this.toolOutput; },
              toolResponseMetadata: { toolName: \${JSON.stringify(toolName)} },
              theme: 'light',
              displayMode: 'inline',
              locale: 'en-US',
              maxHeight: 600,
              safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
              _state: null,
              getState: function() { return this._state; },
              setState: function(s) {
                this._state = s;
                window.parent.postMessage({ type: 'setState', state: s }, '*');
              },
              setWidgetState: function(s) { this.setState(s); },
              callTool: async function(name, args) {
                return new Promise(function(resolve) {
                  const id = Date.now().toString();
                  window.parent.postMessage({ type: 'callTool', id: id, name: name, args: args }, '*');
                  window.addEventListener('message', function handler(e) {
                    if (e.data && e.data.type === 'callToolResult' && e.data.id === id) {
                      window.removeEventListener('message', handler);
                      resolve(e.data.result);
                    }
                  });
                });
              },
              notifyIntrinsicHeight: function() {},
              requestDisplayMode: async function(o) { return { mode: o.mode }; },
              openExternal: async function() {},
              close: function() {},
              uploadFile: async function() { return { fileId: 'mock' }; },
              getFileDownloadUrl: async function() { return { downloadUrl: 'https://example.com/mock' }; },
              sendFollowUpMessage: async function() {},
            };
            window.dispatchEvent(new CustomEvent('openai:set_globals', {
              detail: {
                globals: {
                  toolOutput: \${JSON.stringify(toolResult)},
                  toolResponseMetadata: { toolName: \${JSON.stringify(toolName)} },
                  theme: 'light',
                  displayMode: 'inline',
                  locale: 'en-US',
                },
              },
            }));
          \`;
          // Note: This injection only works if same-origin. For cross-origin, we rely on postMessage.
        } catch (e) {
          // Expected if cross-origin restrictions apply
        }
      });

      console.log('[OpenAI Host] Ready, waiting for widget...');
    })();
  </script>
</body>
</html>`;
  }

  /**
   * Clean up sessions older than TTL
   */
  private cleanupStaleSessions(): void {
    const now = Date.now();
    const ttl = this.options.sessionTTL;
    let cleaned = 0;

    for (const [id, session] of this.sessions) {
      if (now - session.createdAt > ttl) {
        this.sessions.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.log(`Cleaned up ${cleaned} stale sessions`);
    }
  }

  /**
   * Debug logging
   */
  private log(message: string): void {
    if (this.options.debug) {
      // eslint-disable-next-line no-console
      console.log(`[WidgetServer] ${message}`);
    }
  }
}
