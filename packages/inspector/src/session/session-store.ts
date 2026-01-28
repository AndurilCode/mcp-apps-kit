import type { WidgetSession } from "./widget-session.js";

export interface SessionStoreOptions {
  ttlMs?: number; // default: 30 minutes
  cleanupIntervalMs?: number; // default: 5 minutes
}

export class SessionStore {
  private sessions = new Map<string, WidgetSession>();
  private cleanupTimer?: NodeJS.Timeout;
  private ttlMs: number;

  constructor(options?: SessionStoreOptions) {
    this.ttlMs = options?.ttlMs ?? 30 * 60 * 1000;
    const cleanupInterval = options?.cleanupIntervalMs ?? 5 * 60 * 1000;
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupInterval);
  }

  set(sessionId: string, session: WidgetSession): void {
    this.sessions.set(sessionId, session);
  }

  get(sessionId: string): WidgetSession | undefined {
    return this.sessions.get(sessionId);
  }

  touch(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    session.lastAccessedAt = Date.now();
    return true;
  }

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

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  list(): WidgetSession[] {
    return Array.from(this.sessions.values());
  }

  clear(): void {
    for (const session of this.sessions.values()) {
      session.page.close().catch(() => {
        // Ignore errors when closing page
      });
    }
    this.sessions.clear();
  }

  dispose(): void {
    this.clear();
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastAccessedAt > this.ttlMs) {
        this.delete(sessionId);
      }
    }
  }
}
