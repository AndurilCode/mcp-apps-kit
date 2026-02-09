/**
 * Dashboard Notifier
 *
 * Manages SSE clients for real-time session lifecycle notifications.
 * Used by the dashboard to know when sessions are created/closed
 * without polling.
 */

import type { ServerResponse } from "node:http";

/**
 * SSE client connection for dashboard session stream
 */
interface SSEClient {
  res: ServerResponse;
}

/**
 * DashboardNotifier manages SSE connections for session lifecycle events.
 *
 * Usage:
 * - Wire into the dashboard server's `/dashboard/sessions/stream` endpoint
 * - Call `emitSessionCreated` / `emitSessionClosed` from WidgetSessionManager events
 */
export class DashboardNotifier {
  private clients: SSEClient[] = [];

  /**
   * Add a new SSE client. Sets appropriate headers and sends initial keepalive.
   *
   * @param res - The HTTP response to use as an SSE stream
   */
  addClient(res: ServerResponse): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    // Send initial keepalive comment (not an event, just keeps connection open)
    res.write(":keepalive\n\n");

    const client: SSEClient = { res };
    this.clients.push(client);

    // Remove client on connection close
    res.on("close", () => {
      this.removeClient(res);
    });
  }

  /**
   * Remove an SSE client
   */
  removeClient(res: ServerResponse): void {
    this.clients = this.clients.filter((c) => c.res !== res);
  }

  /**
   * Emit a session-created event to all connected SSE clients
   */
  emitSessionCreated(sessionId: string, hostUrl: string): void {
    const data = JSON.stringify({ sessionId, hostUrl });
    this.broadcast("session-created", data);
  }

  /**
   * Emit a session-closed event to all connected SSE clients
   */
  emitSessionClosed(sessionId: string): void {
    const data = JSON.stringify({ sessionId });
    this.broadcast("session-closed", data);
  }

  /**
   * Broadcast an SSE event to all connected clients
   */
  private broadcast(event: string, data: string): void {
    const message = `event: ${event}\ndata: ${data}\n\n`;
    for (const client of this.clients) {
      if (!client.res.writableEnded) {
        client.res.write(message);
      }
    }
  }

  /**
   * Get the number of connected clients
   */
  get clientCount(): number {
    return this.clients.length;
  }
}
