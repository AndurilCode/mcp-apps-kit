import type { Page } from "playwright";
import type { InspectorEvent, TrackedDialog, WidgetToolCall } from "../types";
import type { DetectedProtocol } from "../ui-host";
import type { ConsoleLogEntry } from "../tools/get-console-logs";
import type {
  ActiveWidgetSession,
  SessionInfo,
  SessionSource,
  ProxyMetadata,
} from "./widget-session";

export interface SessionStoreOptions {
  /** Session TTL in milliseconds (default: 30 minutes) */
  ttlMs?: number;
  /** Session TTL in milliseconds (alias for ttlMs) */
  ttl?: number;
  /** Cleanup interval in milliseconds (default: 5 minutes) */
  cleanupIntervalMs?: number;
  /** Enable debug logging */
  debug?: boolean;
}

export interface CreateSessionOptions {
  sessionId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  toolResult: unknown;
  page: Page;
  protocol: DetectedProtocol;
  source?: SessionSource;
  proxyMetadata?: ProxyMetadata;
  onTouch?: () => void;
}

export class SessionStore {
  private sessions = new Map<string, ActiveWidgetSession>();
  private cleanupTimer?: NodeJS.Timeout;
  private ttlMs: number;
  private debug: boolean;

  constructor(options?: SessionStoreOptions) {
    // Support both ttl and ttlMs for backward compatibility
    this.ttlMs = options?.ttl ?? options?.ttlMs ?? 30 * 60 * 1000;
    this.debug = options?.debug ?? false;
    const cleanupInterval = options?.cleanupIntervalMs ?? 5 * 60 * 1000;
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupInterval);
  }

  /**
   * Create a new session
   */
  create(options: CreateSessionOptions): ActiveWidgetSession {
    const now = Date.now();
    const session: ActiveWidgetSession = {
      id: options.sessionId,
      toolName: options.toolName,
      toolArgs: options.toolArgs,
      toolResult: options.toolResult,
      page: options.page,
      protocol: options.protocol,
      source: options.source ?? "agent",
      proxyMetadata: options.proxyMetadata,
      createdAt: now,
      lastAccessedAt: now,
      consoleLogs: [],
      pageErrors: [],
      dialogs: [],
      toolCalls: [],
      events: [],
      onTouch: options.onTouch,
    };
    this.sessions.set(options.sessionId, session);

    if (this.debug) {
      console.log(`[SessionStore] Created session ${options.sessionId}`);
    }

    return session;
  }

  /**
   * Get a session and update its lastAccessedAt (touch)
   */
  get(sessionId: string): ActiveWidgetSession | null {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastAccessedAt = Date.now();
      session.onTouch?.();
    }
    return session ?? null;
  }

  /**
   * Get a session without updating lastAccessedAt
   */
  peek(sessionId: string): ActiveWidgetSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  /**
   * Set/replace a session
   */
  set(sessionId: string, session: ActiveWidgetSession): void {
    this.sessions.set(sessionId, session);
  }

  /**
   * Touch a session to reset its TTL
   */
  touch(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    session.lastAccessedAt = Date.now();
    session.onTouch?.();
    return true;
  }

  /**
   * Check if session exists
   */
  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Record an inspector event
   */
  recordEvent(sessionId: string, event: InspectorEvent): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.events.push(event);
    }
  }

  /**
   * Record a console log entry
   */
  recordConsoleLog(sessionId: string, log: ConsoleLogEntry): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.consoleLogs.push(log);
    }
  }

  /**
   * Record a page error
   */
  recordPageError(sessionId: string, error: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.pageErrors.push(error);
    }
  }

  /**
   * Record a dialog
   */
  recordDialog(sessionId: string, dialog: TrackedDialog): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.dialogs.push(dialog);
    }
  }

  /**
   * Record a tool call (also updates lastAccessedAt)
   */
  recordToolCall(sessionId: string, toolCall: WidgetToolCall): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.toolCalls.push(toolCall);
      session.lastAccessedAt = Date.now();
    }
  }

  /**
   * Update the tool result for a session
   */
  updateToolResult(sessionId: string, toolResult: unknown): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    session.toolResult = toolResult;
    session.lastAccessedAt = Date.now();
    return true;
  }

  /**
   * Get all session IDs
   */
  keys(): IterableIterator<string> {
    return this.sessions.keys();
  }

  /**
   * Get all sessions
   */
  values(): IterableIterator<ActiveWidgetSession> {
    return this.sessions.values();
  }

  /**
   * List all sessions (returns public session info)
   */
  list(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((session) => ({
      id: session.id,
      toolName: session.toolName,
      protocol: session.protocol,
      source: session.source,
      createdAt: session.createdAt,
      lastAccessedAt: session.lastAccessedAt,
      logCount: session.consoleLogs.length,
      errorCount: session.pageErrors.length,
      dialogCount: session.dialogs.length,
    }));
  }

  /**
   * Delete a session (legacy - use close() instead)
   */
  delete(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    session.page.close().catch(() => {
      // Ignore errors when closing page
    });
    return this.sessions.delete(sessionId);
  }

  /**
   * Close a session (closes page and removes from store)
   */
  async close(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    try {
      if (!session.page.isClosed()) {
        await session.page.close();
      }
    } catch {
      // Ignore errors when closing page
    }

    this.sessions.delete(sessionId);

    if (this.debug) {
      console.log(`[SessionStore] Closed session ${sessionId}`);
    }

    return true;
  }

  /**
   * Close all sessions
   */
  async closeAll(): Promise<number> {
    const count = this.sessions.size;
    const promises: Promise<void>[] = [];

    for (const session of this.sessions.values()) {
      if (!session.page.isClosed()) {
        promises.push(
          session.page.close().catch(() => {
            // Ignore errors when closing page
          })
        );
      }
    }

    await Promise.all(promises);
    this.sessions.clear();

    if (this.debug) {
      console.log(`[SessionStore] Closed ${count} session(s)`);
    }

    return count;
  }

  /**
   * Clear all sessions (sync version, doesn't wait for page close)
   */
  clear(): void {
    for (const session of this.sessions.values()) {
      session.page.close().catch(() => {
        // Ignore errors when closing page
      });
    }
    this.sessions.clear();
  }

  /**
   * Dispose the store (stop cleanup timer and close all sessions)
   */
  async dispose(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    await this.closeAll();

    if (this.debug) {
      console.log(`[SessionStore] Disposed`);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const expiredIds: string[] = [];

    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastAccessedAt > this.ttlMs) {
        expiredIds.push(sessionId);
      }
    }

    for (const sessionId of expiredIds) {
      this.delete(sessionId);
      if (this.debug) {
        console.log(`[SessionStore] Expired session ${sessionId}`);
      }
    }
  }
}
