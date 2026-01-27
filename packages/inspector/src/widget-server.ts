/**
 * Widget Server
 *
 * Lightweight HTTP server that serves widget sessions with proper iframe embedding.
 * This enables correct postMessage communication where event.source === window.parent.
 *
 * ## Architecture Note
 *
 * This class manages **HTTP session storage** for serving widget HTML content.
 * Sessions are identified by UUID and cleaned up based on `createdAt` timestamp.
 *
 * **Distinct from WidgetSessionManager** which manages **Playwright page instances**
 * for interactive widget testing. The two classes have different TTL behaviors:
 *
 * - **WidgetServer**: TTL based on `createdAt` (static expiration)
 * - **WidgetSessionManager**: TTL based on `lastAccessedAt` (sliding expiration)
 *
 * This separation allows the HTTP server to efficiently garbage-collect served
 * content while keeping interactive Playwright sessions alive as long as they're
 * being actively used.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { EnvironmentState } from "./types";

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
  environmentState?: EnvironmentState;
  /** Raw external MCP hostContext (from ui/initialize response) for 1:1 sync */
  externalHostContext?: Record<string, unknown>;
  /** Inspector URL for tool call execution endpoint */
  inspectorUrl?: string;
  /** If true, wait for synced tool call responses instead of executing directly */
  isDualMode?: boolean;
  // Metadata fields for production parity (legacy, kept for backward compat)
  subjectId?: string;
  sessionId?: string;
  locale?: string;
  userLocation?: {
    city?: string;
    region?: string;
    country?: string;
    timezone?: string;
  };
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
   *
   * @param externalHostContext - Raw MCP hostContext from external widget's ui/initialize response
   * @param inspectorUrl - Inspector server URL for tool call execution (e.g., "http://localhost:6274")
   */
  createSession(
    html: string,
    toolResult: unknown,
    toolName: string,
    protocol: "mcp" | "openai",
    environmentState?: EnvironmentState,
    externalHostContext?: Record<string, unknown>,
    inspectorUrl?: string,
    isDualMode?: boolean
  ): CreateSessionResult {
    const sessionId = randomUUID();
    const session: WidgetSession = {
      id: sessionId,
      html,
      toolResult,
      toolName,
      protocol,
      createdAt: Date.now(),
      environmentState,
      externalHostContext,
      inspectorUrl,
      isDualMode,
      // Generate mock metadata for production parity (legacy support)
      subjectId: `mock-subject-${randomUUID().slice(0, 8)}`,
      sessionId: `mock-session-${randomUUID().slice(0, 8)}`,
      locale: environmentState?.locale ?? "en-US",
      userLocation: environmentState?.userLocation ?? {
        city: "Unknown",
        country: "US",
        timezone: "UTC",
      },
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
   * Touch a session to extend its TTL
   *
   * Resets the session's createdAt timestamp to extend its lifetime.
   * This is used when the linked WidgetSessionManager session is accessed,
   * keeping both sessions in sync for active usage scenarios.
   */
  touchSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    session.createdAt = Date.now();
    this.log(`Touched session ${sessionId}`);
    return true;
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

    // For OpenAI protocol, inject the runtime bootstrap script directly into the widget HTML
    let html = session.html;
    if (session.protocol === "openai") {
      html = this.injectOpenAIRuntime(html, session);
    }

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(html);
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
    const env = session.environmentState;

    // Use external hostContext if available (synced from external widget's ui/initialize)
    // This ensures 1:1 state sync with the external widget
    const ext = session.externalHostContext ?? {};
    const theme = (ext.theme as string) ?? env?.theme ?? "light";
    const displayMode = (ext.displayMode as string) ?? env?.displayMode ?? "inline";
    const locale = (ext.locale as string) ?? env?.locale ?? "en-US";
    const timeZone = (ext.timeZone as string) ?? env?.timeZone ?? "UTC";
    const platform =
      (ext.platform as string) ??
      (env?.userAgent?.device?.type === "mobile" ? "mobile" : "desktop");

    // Serialize the full external hostContext for use in ui/initialize response
    const externalHostContextJson = JSON.stringify(ext);

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
  <iframe id="widget-frame" src="${widgetUrl}" sandbox="allow-scripts allow-same-origin allow-forms allow-modals"></iframe>
  <script>
    (function() {
      const toolResult = ${toolResultJson};
      const toolName = ${toolNameJson};
      const iframe = document.getElementById('widget-frame');
      let initialized = false;

      // External hostContext from ui/initialize sync (captured before session creation)
      const externalHostContext = ${externalHostContextJson};

      // Fallback hostContext values (from session.environmentState)
      const fallbackHostContext = {
        theme: '${theme}',
        displayMode: '${displayMode}',
        availableDisplayModes: ['inline', 'fullscreen'],
        locale: '${locale}',
        timeZone: '${timeZone}',
        platform: '${platform}',
        viewport: ${JSON.stringify(env?.viewport ?? { width: 800, height: 600 })},
        toolInfo: {
          tool: { name: toolName, inputSchema: { type: 'object' } },
        },
      };

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

          // Build hostContext: fallback -> external (pre-session) -> runtime updates
          // This ensures external widget's hostContext is reflected in Playwright widget
          const runtimeUpdates = window.__mcpHostContextUpdates || {};
          const hostContext = { ...fallbackHostContext, ...externalHostContext, ...runtimeUpdates };
          console.log('[MCP Host] Using hostContext:', JSON.stringify(hostContext));

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
              hostContext: hostContext,
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
          // Store for get_widget_state observation
          window.__inspectorToolCalls = window.__inspectorToolCalls || [];
          window.__inspectorToolCalls.push({
            name: message.params.name,
            args: message.params.arguments,
            timestamp: Date.now()
          });

          console.log('[WIDGET_TOOL_CALL] ' + JSON.stringify({
            name: message.params.name,
            args: message.params.arguments,
          }));

          const inspectorUrl = ${JSON.stringify(session.inspectorUrl ?? null)};
          const isDualMode = ${JSON.stringify(session.isDualMode ?? false)};

          if (isDualMode) {
            // In dual mode, wait for synced tool response from external widget
            // instead of executing the call ourselves (which would duplicate)
            window.__pendingToolCalls = window.__pendingToolCalls || {};
            window.__pendingToolCalls[message.params.name] = window.__pendingToolCalls[message.params.name] || [];
            window.__pendingToolCalls[message.params.name].push({
              messageId: message.id,
              args: message.params.arguments,
              timestamp: Date.now()
            });
            console.log('[MCP Host] Dual mode: queued tool call, waiting for synced response:', message.params.name);

            // Set a timeout to return mock result if no sync arrives
            setTimeout(function() {
              var pending = window.__pendingToolCalls && window.__pendingToolCalls[message.params.name];
              if (pending) {
                var idx = pending.findIndex(function(p) { return p.messageId === message.id; });
                if (idx !== -1) {
                  pending.splice(idx, 1);
                  console.log('[MCP Host] Tool call timed out, returning mock:', message.params.name);
                  iframe.contentWindow.postMessage({
                    jsonrpc: '2.0',
                    id: message.id,
                    result: { content: [{ type: 'text', text: '{"synced": false, "timeout": true}' }] }
                  }, '*');
                }
              }
            }, 10000); // 10 second timeout
          } else if (inspectorUrl) {
            // Standalone mode: execute on connected server via inspector endpoint
            fetch(inspectorUrl + '/execute-tool', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId: '${session.id}',
                toolName: message.params.name,
                args: message.params.arguments,
                messageId: message.id
              })
            })
            .then(function(res) { return res.json(); })
            .then(function(result) {
              iframe.contentWindow.postMessage({
                jsonrpc: '2.0',
                id: message.id,
                result: result
              }, '*');
              console.log('[MCP Host] Tool call executed:', message.params.name);
            })
            .catch(function(err) {
              console.error('[MCP Host] Tool call failed:', err);
              iframe.contentWindow.postMessage({
                jsonrpc: '2.0',
                id: message.id,
                error: { code: -32000, message: 'Tool execution failed: ' + err.message }
              }, '*');
            });
          } else {
            // No inspector URL - return mock result (for tests or offline)
            console.log('[MCP Host] No inspector URL, returning mock result');
            const callResponse = {
              jsonrpc: '2.0',
              id: message.id,
              result: {
                content: [{ type: 'text', text: '{"mock": true}' }],
              },
            };
            iframe.contentWindow.postMessage(callResponse, '*');
          }
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
   * Simpler now since the runtime is injected directly into the widget HTML
   */
  private generateOpenAIHostPage(session: WidgetSession): string {
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
  <iframe id="widget-frame" src="${widgetUrl}" sandbox="allow-scripts allow-same-origin allow-forms allow-modals"></iframe>
  <script>
    // Simple host that listens for widget messages
    const iframe = document.getElementById('widget-frame');

    window.addEventListener('message', function(event) {
      // Only accept messages from our iframe
      if (event.source !== iframe.contentWindow) return;

      const message = event.data;
      console.log('[OpenAI Host] Received:', JSON.stringify(message));

      // Handle widget tool calls
      if (message && message.type === 'openai:callTool') {
        // Store for get_widget_state observation
        window.__inspectorToolCalls = window.__inspectorToolCalls || [];
        window.__inspectorToolCalls.push({
          name: message.toolName,
          args: message.args,
          timestamp: Date.now()
        });

        console.log('[WIDGET_TOOL_CALL]', message.toolName, message.args);

        const inspectorUrl = ${JSON.stringify(session.inspectorUrl ?? null)};
        const isDualMode = ${JSON.stringify(session.isDualMode ?? false)};

        if (isDualMode) {
          // In dual mode, wait for synced tool response from external widget
          // instead of executing the call ourselves (which would duplicate)
          window.__pendingToolCalls = window.__pendingToolCalls || {};
          window.__pendingToolCalls[message.toolName] = window.__pendingToolCalls[message.toolName] || [];
          window.__pendingToolCalls[message.toolName].push({
            callId: message.callId,
            args: message.args,
            timestamp: Date.now()
          });
          console.log('[OpenAI Host] Dual mode: queued tool call, waiting for synced response:', message.toolName);

          // Set a timeout to return mock result if no sync arrives
          setTimeout(function() {
            var pending = window.__pendingToolCalls && window.__pendingToolCalls[message.toolName];
            if (pending) {
              var idx = pending.findIndex(function(p) { return p.callId === message.callId; });
              if (idx !== -1) {
                pending.splice(idx, 1);
                console.log('[OpenAI Host] Tool call timed out, returning mock:', message.toolName);
                iframe.contentWindow.postMessage({
                  type: 'openai:callTool:response',
                  callId: message.callId,
                  result: { output: '{"synced": false, "timeout": true}' }
                }, '*');
              }
            }
          }, 10000); // 10 second timeout
        } else if (inspectorUrl) {
          // Standalone mode: execute on connected server via inspector endpoint
          fetch(inspectorUrl + '/execute-tool', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: '${session.id}',
              toolName: message.toolName,
              args: message.args,
              callId: message.callId
            })
          })
          .then(function(res) { return res.json(); })
          .then(function(result) {
            iframe.contentWindow.postMessage({
              type: 'openai:callTool:response',
              callId: message.callId,
              result: result
            }, '*');
            console.log('[OpenAI Host] Tool call executed:', message.toolName);
          })
          .catch(function(err) {
            console.error('[OpenAI Host] Tool call failed:', err);
            iframe.contentWindow.postMessage({
              type: 'openai:callTool:response',
              callId: message.callId,
              error: 'Tool execution failed: ' + err.message
            }, '*');
          });
        } else {
          // No inspector URL - return mock result (for tests or offline)
          console.log('[OpenAI Host] No inspector URL, returning mock result');
          iframe.contentWindow.postMessage({
            type: 'openai:callTool:response',
            callId: message.callId,
            result: { output: '{"mock": true}' }
          }, '*');
        }
      }

      // Handle state changes
      if (message && message.type === 'openai:setWidgetState') {
        console.log('[OpenAI Host] Widget state changed:', message.state);
      }

      // Handle resize
      if (message && message.type === 'openai:resize') {
        console.log('[OpenAI Host] Widget height:', message.height);
        // Track height changes for test assertions
        window.__hostState = window.__hostState || {};
        window.__hostState.heights = window.__hostState.heights || [];
        window.__hostState.heights.push({ height: message.height, timestamp: Date.now() });
      }

      // Handle navigation
      if (message && message.type === 'openai:navigation') {
        console.log('[OpenAI Host] Navigation:', message.url, message.title);
        window.__hostState = window.__hostState || {};
        window.__hostState.navigations = window.__hostState.navigations || [];
        window.__hostState.navigations.push({ url: message.url, title: message.title, timestamp: Date.now() });
      }

      // Handle CSP violations
      if (message && message.type === 'openai:cspViolation') {
        console.error('[OpenAI Host] CSP Violation:', message.violation);
        window.__hostState = window.__hostState || {};
        window.__hostState.cspViolations = window.__hostState.cspViolations || [];
        window.__hostState.cspViolations.push(message.violation);
      }

      // Handle errors
      if (message && message.type === 'openai:error') {
        console.error('[OpenAI Host] Widget Error:', message.error);
        window.__hostState = window.__hostState || {};
        window.__hostState.errors = window.__hostState.errors || [];
        window.__hostState.errors.push(message.error);
      }

      // Handle modal requests
      if (message && message.type === 'openai:requestModal') {
        console.log('[OpenAI Host] Modal requested:', message.params, message.template);
        // Return empty result (inspector can't spawn real modals)
        iframe.contentWindow.postMessage({
          type: 'openai:modal:response',
          modalId: message.modalId,
          result: { dismissed: true, reason: 'inspector_mock' }
        }, '*');
      }

      // Handle setOpenInAppUrl
      if (message && message.type === 'openai:setOpenInAppUrl') {
        console.log('[OpenAI Host] Open in app URL set:', message.href);
        window.__hostState = window.__hostState || {};
        window.__hostState.openInAppUrl = message.href;
      }

      // Handle storage changes
      if (message && message.type === 'openai:storageChange') {
        console.log('[OpenAI Host] Storage changed:', message.key, message.newValue);
        window.__hostState = window.__hostState || {};
        window.__hostState.storageChanges = window.__hostState.storageChanges || [];
        window.__hostState.storageChanges.push({
          key: message.key,
          oldValue: message.oldValue,
          newValue: message.newValue,
          url: message.url,
          timestamp: Date.now()
        });
      }
    });

    console.log('[OpenAI Host] Ready');
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

  /**
   * Inject OpenAI runtime bootstrap script into widget HTML
   * This creates the window.openai object that widgets expect
   */
  private injectOpenAIRuntime(html: string, session: WidgetSession): string {
    const toolResultJson = JSON.stringify(session.toolResult);
    const toolNameJson = JSON.stringify(session.toolName);
    const subjectIdJson = JSON.stringify(
      session.subjectId ?? `mock-subject-${randomUUID().slice(0, 8)}`
    );
    const sessionIdJson = JSON.stringify(
      session.sessionId ?? `mock-session-${randomUUID().slice(0, 8)}`
    );

    // Use environment state if available, otherwise fall back to legacy session fields
    const env = session.environmentState;
    const localeJson = JSON.stringify(env?.locale ?? session.locale ?? "en-US");
    const themeJson = JSON.stringify(env?.theme ?? "light");
    const displayModeJson = JSON.stringify(env?.displayMode ?? "inline");
    const maxHeightJson = env?.maxHeight ? String(env.maxHeight) : "null";
    const safeAreaJson = JSON.stringify(
      env?.safeAreaInsets ?? { top: 0, right: 0, bottom: 0, left: 0 }
    );
    const userAgentJson = JSON.stringify(
      env?.userAgent ?? { device: { type: "desktop" }, capabilities: { hover: true, touch: false } }
    );
    const userLocationJson = env?.userLocation
      ? JSON.stringify(env.userLocation)
      : session.userLocation
        ? JSON.stringify(session.userLocation)
        : JSON.stringify({ city: "Unknown", country: "US", timezone: "UTC" });

    // Create the runtime bootstrap script that will be injected into the widget
    const runtimeScript = `
<script id="openai-runtime-bootstrap">
(function() {
  // OpenAI Runtime Bootstrap for ${session.toolName}
  const toolOutput = ${toolResultJson};
  const toolName = ${toolNameJson};
  const toolResponseMetadata = { toolName: toolName };

  // Create the window.openai SDK object
  const openaiAPI = {
    toolInput: {},
    toolOutput: toolOutput,
    toolResponseMetadata: toolResponseMetadata,
    displayMode: ${displayModeJson},
    theme: ${themeJson},
    locale: ${localeJson},
    maxHeight: ${maxHeightJson},
    safeArea: ${safeAreaJson},
    userAgent: ${userAgentJson},
    view: { mode: ${displayModeJson}, params: {} },
    widgetState: null,
    widgetSessionId: '${session.id}',
    subjectId: ${subjectIdJson},
    sessionId: ${sessionIdJson},
    userLocation: ${userLocationJson},
    _callId: 0,
    _modalId: 0,
    _openInAppUrl: null,
    _uploadedFiles: new Map(),

    setWidgetState(state) {
      this.widgetState = state;
      window.parent.postMessage({ type: 'openai:setWidgetState', state: state }, '*');
    },

    callTool(toolName, args = {}) {
      const callId = ++this._callId;
      return new Promise((resolve, reject) => {
        const handler = (event) => {
          if (event.data?.type === 'openai:callTool:response' && event.data.callId === callId) {
            window.removeEventListener('message', handler);
            event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.result);
          }
        };
        window.addEventListener('message', handler);
        window.parent.postMessage({
          type: 'openai:callTool',
          callId: callId,
          toolName: toolName,
          args: args
        }, '*');
        setTimeout(() => {
          window.removeEventListener('message', handler);
          reject(new Error('Tool call timeout'));
        }, 30000);
      });
    },

    sendFollowUpMessage(opts) {
      const prompt = typeof opts === 'string' ? opts : opts?.prompt || '';
      window.parent.postMessage({ type: 'openai:sendFollowup', message: prompt }, '*');
    },

    requestDisplayMode(options = {}) {
      const mode = options.mode || 'inline';
      const validModes = ['inline', 'fullscreen', 'pip'];
      if (!validModes.includes(mode)) {
        console.warn('[OpenAI Runtime] Invalid display mode:', mode);
      }
      this.displayMode = mode;
      this.view = { ...this.view, mode: mode };
      window.parent.postMessage({ 
        type: 'openai:requestDisplayMode', 
        mode: mode, 
        maxHeight: options.maxHeight,
        pip: options.pip
      }, '*');
      return { mode: mode };
    },

    setOpenInAppUrl(options) {
      const href = typeof options === 'string' ? options : options?.href;
      if (!href) throw new Error('href is required for setOpenInAppUrl');
      this._openInAppUrl = href;
      window.parent.postMessage({ type: 'openai:setOpenInAppUrl', href: href }, '*');
    },

    requestClose() {
      window.parent.postMessage({ type: 'openai:requestClose' }, '*');
    },

    openExternal(options) {
      const href = typeof options === 'string' ? options : options?.href;
      if (!href) throw new Error('href is required for openExternal');
      window.parent.postMessage({ type: 'openai:openExternal', href: href }, '*');
    },

    notifyIntrinsicHeight(height) {
      if (typeof height === 'number' && height > 0) {
        window.parent.postMessage({ type: 'openai:resize', height: Math.round(height) }, '*');
      }
    },

    notifyNavigation(options) {
      const url = options?.url || window.location.href;
      const title = options?.title || document.title;
      window.parent.postMessage({ type: 'openai:navigation', url: url, title: title }, '*');
    },

    requestModal(options = {}) {
      return new Promise((resolve, reject) => {
        const modalId = ++this._modalId;
        const handler = (event) => {
          if (event.data?.type === 'openai:modal:response' && event.data.modalId === modalId) {
            window.removeEventListener('message', handler);
            event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.result);
          }
        };
        window.addEventListener('message', handler);
        window.parent.postMessage({
          type: 'openai:requestModal',
          modalId: modalId,
          params: options.params,
          template: options.template
        }, '*');
        setTimeout(() => {
          window.removeEventListener('message', handler);
          reject(new Error('Modal request timeout'));
        }, 30000);
      });
    },

    uploadFile: async function(file) {
      const fileId = 'file-' + Math.random().toString(36).slice(2, 10);
      // Store file data for later download URL generation
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve) => {
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      this._uploadedFiles.set(fileId, { 
        name: file.name, 
        type: file.type, 
        size: file.size, 
        dataUrl: dataUrl
      });
      return { fileId: fileId };
    },
    
    getFileDownloadUrl: async function(options) {
      const fileId = typeof options === 'string' ? options : options?.fileId;
      const file = this._uploadedFiles.get(fileId);
      if (file) {
        // Return data URL for testing (works in browser)
        return { downloadUrl: file.dataUrl };
      }
      // Return mock URL for unknown files
      return { downloadUrl: 'https://example.com/mock-download/' + fileId };
    },
  };

  // Hook history methods for automatic navigation tracking
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = function(state, title, url) {
    originalPushState(state, title, url);
    openaiAPI.notifyNavigation({ url: url?.toString(), title: title });
  };

  history.replaceState = function(state, title, url) {
    originalReplaceState(state, title, url);
    openaiAPI.notifyNavigation({ url: url?.toString(), title: title });
  };

  window.addEventListener('popstate', () => {
    openaiAPI.notifyNavigation();
  });

  // Enhanced error reporting
  document.addEventListener('securitypolicyviolation', (e) => {
    const violation = {
      blockedURI: e.blockedURI,
      violatedDirective: e.violatedDirective,
      originalPolicy: e.originalPolicy,
      disposition: e.disposition,
      timestamp: Date.now()
    };
    window.parent.postMessage({ type: 'openai:cspViolation', violation: violation }, '*');
    console.error('[CSP Violation]', violation.violatedDirective, violation.blockedURI);
  });

  window.addEventListener('error', (e) => {
    window.parent.postMessage({ 
      type: 'openai:error', 
      error: { message: e.message, filename: e.filename, lineno: e.lineno, colno: e.colno }
    }, '*');
  });

  window.addEventListener('unhandledrejection', (e) => {
    window.parent.postMessage({ 
      type: 'openai:error', 
      error: { message: String(e.reason), type: 'unhandledrejection' }
    }, '*');
  });

  // Storage event sync - sync localStorage changes to host
  window.addEventListener('storage', (e) => {
    if (e.storageArea === localStorage) {
      window.parent.postMessage({
        type: 'openai:storageChange',
        key: e.key,
        oldValue: e.oldValue,
        newValue: e.newValue,
        url: e.url
      }, '*');
    }
  });

  // Listen for storage sync from host
  window.addEventListener('message', (event) => {
    // Only accept messages from parent (security validation)
    if (event.source !== window.parent) return;

    if (event.data?.type === 'openai:syncStorage') {
      const key = event.data.key;
      const value = event.data.value;
      if (value === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, value);
      }
    }

    // Handle inspector sync events (globals, theme, tool data)
    if (event.data?.type === 'openai:inspector_sync') {
      const syncType = event.data.syncType;
      const data = event.data.data;
      console.log('[OpenAI Runtime] Received inspector sync:', syncType, data);

      switch (syncType) {
        case 'globals':
        case 'host-context-changed': {
          // Update window.openai properties
          const g = data || {};
          if (g.theme !== undefined) openaiAPI.theme = g.theme;
          if (g.displayMode !== undefined) openaiAPI.displayMode = g.displayMode;
          if (g.locale !== undefined) openaiAPI.locale = g.locale;
          if (g.maxHeight !== undefined) openaiAPI.maxHeight = g.maxHeight;
          if (g.safeArea !== undefined) openaiAPI.safeArea = g.safeArea;
          if (g.userAgent !== undefined) openaiAPI.userAgent = g.userAgent;
          if (g.userLocation !== undefined) openaiAPI.userLocation = g.userLocation;
          if (g.toolOutput !== undefined) openaiAPI.toolOutput = g.toolOutput;
          if (g.toolInput !== undefined) openaiAPI.toolInput = g.toolInput;
          if (g.toolResponseMetadata !== undefined) openaiAPI.toolResponseMetadata = g.toolResponseMetadata;
          // Dispatch CustomEvent for SDK listeners
          window.dispatchEvent(new CustomEvent('openai:set_globals', {
            detail: { globals: g }
          }));
          break;
        }

        case 'tool-output':
        case 'tool-result':
          openaiAPI.toolOutput = data;
          window.dispatchEvent(new CustomEvent('openai:set_globals', {
            detail: { globals: { toolOutput: data } }
          }));
          break;

        case 'tool-input':
          openaiAPI.toolInput = data;
          window.dispatchEvent(new CustomEvent('openai:set_globals', {
            detail: { globals: { toolInput: data } }
          }));
          break;

        case 'tool-input-partial': {
          // Merge partial input with existing
          const existing = openaiAPI.toolInput || {};
          openaiAPI.toolInput = { ...existing, ...data };
          window.dispatchEvent(new CustomEvent('openai:set_globals', {
            detail: { globals: { toolInput: data } }
          }));
          break;
        }

        case 'tool-response-metadata':
          openaiAPI.toolResponseMetadata = data;
          break;

        case 'call-tool-response':
          // Re-dispatch as the expected message type
          window.postMessage({
            type: 'openai:callTool:response',
            ...data
          }, '*');
          break;

        case 'tool-cancelled':
          window.dispatchEvent(new CustomEvent('openai:tool_cancelled'));
          break;
      }
    }
  });

  // Define window.openai as non-writable
  Object.defineProperty(window, 'openai', {
    value: openaiAPI,
    writable: false,
    configurable: false,
    enumerable: true
  });

  // Dispatch openai:set_globals event
  setTimeout(() => {
    try {
      window.dispatchEvent(new CustomEvent('openai:set_globals', {
        detail: {
          globals: {
            displayMode: openaiAPI.displayMode,
            maxHeight: openaiAPI.maxHeight,
            theme: openaiAPI.theme,
            locale: openaiAPI.locale,
            safeArea: openaiAPI.safeArea,
            userAgent: openaiAPI.userAgent,
            userLocation: openaiAPI.userLocation,
            toolOutput: toolOutput,
            toolResponseMetadata: toolResponseMetadata
          }
        }
      }));
    } catch (err) {
      console.error('[OpenAI Runtime] Failed to dispatch globals event:', err);
    }
  }, 0);

  // Auto-resize with ResizeObserver
  try {
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
        if (height > 0) {
          openaiAPI.notifyIntrinsicHeight(height);
        }
      }
    });
    
    if (document.body) {
      resizeObserver.observe(document.body);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        resizeObserver.observe(document.body);
      });
    }
  } catch (err) {
    console.warn('[OpenAI Runtime] ResizeObserver not available:', err);
  }

  console.log('[OpenAI Runtime] Initialized for tool:', toolName);
})();
</script>
`;

    // Inject the runtime script right after <head> tag or at the start of <body>
    // Priority: After <head>, or at start of <body>, or at start of document
    if (html.includes("</head>")) {
      return html.replace("</head>", `${runtimeScript}\n</head>`);
    } else if (html.includes("<body")) {
      return html.replace(/<body([^>]*)>/, `<body$1>\n${runtimeScript}`);
    } else {
      // Fallback: prepend to the HTML
      return runtimeScript + "\n" + html;
    }
  }
}
