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
import {
  generateMcpHostPage as generateMcpHostPageTemplate,
  generateOpenAIHostPage as generateOpenAIHostPageTemplate,
  generateOpenAIRuntimeScript,
  injectOpenAIRuntime as injectOpenAIRuntimeHtml,
  type McpHostContext,
  type OpenAIHostContext,
  type OpenAIRuntimeContext,
} from "./widget-server-templates";

/**
 * Widget session data
 */
export interface WidgetSession {
  id: string;
  html: string;
  toolResult: unknown;
  toolName: string;
  /** Arguments passed to the tool (tool input) */
  toolArgs: Record<string, unknown>;
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
   * @param toolArgs - Arguments passed to the tool (tool input)
   * @param externalHostContext - Raw MCP hostContext from external widget's ui/initialize response
   * @param inspectorUrl - Inspector server URL for tool call execution (e.g., "http://localhost:6274")
   */
  createSession(
    html: string,
    toolResult: unknown,
    toolName: string,
    toolArgs: Record<string, unknown>,
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
      toolArgs,
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
   *
   * Delegates to the templates module for actual HTML generation.
   */
  private generateMcpHostPage(session: WidgetSession): string {
    const toolResultJson = JSON.stringify(session.toolResult);
    const toolNameJson = JSON.stringify(session.toolName);
    const toolArgsJson = JSON.stringify(session.toolArgs);
    const widgetUrl = `http://127.0.0.1:${this.port}/widget/${session.id}`;
    const env = session.environmentState;

    // Use external hostContext if available (synced from external widget's ui/initialize)
    const ext = session.externalHostContext ?? {};
    const theme = (ext.theme as string) ?? env?.theme ?? "light";
    const displayMode = (ext.displayMode as string) ?? env?.displayMode ?? "inline";
    const locale = (ext.locale as string) ?? env?.locale ?? "en-US";
    const timeZone = (ext.timeZone as string) ?? env?.timeZone ?? "UTC";
    const platform =
      (ext.platform as string) ??
      (env?.userAgent?.device?.type === "mobile" ? "mobile" : "desktop");
    const externalHostContextJson = JSON.stringify(ext);

    const ctx: McpHostContext = {
      session,
      widgetUrl,
      toolResultJson,
      toolNameJson,
      toolArgsJson,
      theme,
      displayMode,
      locale,
      timeZone,
      platform,
      externalHostContextJson,
    };

    return generateMcpHostPageTemplate(ctx);
  }

  /**
   * Generate OpenAI host page HTML
   *
   * Simpler now since the runtime is injected directly into the widget HTML.
   * Delegates to the templates module for actual HTML generation.
   */
  private generateOpenAIHostPage(session: WidgetSession): string {
    const widgetUrl = `http://127.0.0.1:${this.port}/widget/${session.id}`;

    const ctx: OpenAIHostContext = {
      session,
      widgetUrl,
    };

    return generateOpenAIHostPageTemplate(ctx);
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
   *
   * This creates the window.openai object that widgets expect.
   * Delegates to the templates module for script generation and injection.
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

    const ctx: OpenAIRuntimeContext = {
      session,
      toolResultJson,
      toolNameJson,
      subjectIdJson,
      sessionIdJson,
      localeJson,
      themeJson,
      displayModeJson,
      maxHeightJson,
      safeAreaJson,
      userAgentJson,
      userLocationJson,
    };

    const runtimeScript = generateOpenAIRuntimeScript(ctx);
    return injectOpenAIRuntimeHtml(html, runtimeScript);
  }
}
