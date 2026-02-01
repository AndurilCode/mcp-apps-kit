/**
 * Connection registry for MCP Inspector Server
 *
 * Manages multiple ConnectionManager instances and tracks active connection.
 */

import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type { ConnectionParams } from "@mcp-apps-kit/testing";
import { ConnectionManager } from "./connection";
import type { ConnectOptions, ConnectionStatusOutput, InspectorServerOptions } from "./types";
import type { OAuthState } from "./oauth/types";

/**
 * Event map emitted by the connection registry.
 */
export interface ConnectionRegistryEvents {
  /** Emitted when a new connection is created. */
  created: [id: string, connectionManager: ConnectionManager];
  /** Emitted when a connection is closed. */
  closed: [id: string];
  /** Emitted when a connection is activated. */
  activated: [id: string];
}

/**
 * Options for configuring a ConnectionRegistry instance.
 */
export interface ConnectionRegistryOptions {
  /** Maximum number of concurrent connections. Default: 20. */
  maxConnections?: number;
  /** Base options for each ConnectionManager instance. */
  connectionManagerOptions?: InspectorServerOptions;
}

/**
 * Connection status augmented with the registry connection id.
 */
export interface ConnectionInfo extends ConnectionStatusOutput {
  id: string;
  /** OAuth authentication state (present for HTTP connections with OAuth) */
  oauth?: OAuthState;
}

/**
 * Tracks multiple ConnectionManager instances and the active connection.
 */
export class ConnectionRegistry extends EventEmitter {
  private readonly connections: Map<string, ConnectionManager> = new Map();
  private activeConnectionId: string | null = null;
  private readonly maxConnections: number;
  private readonly connectionManagerOptions: InspectorServerOptions;

  /**
   * Create a ConnectionRegistry instance.
   *
   * @param options - Registry configuration options.
   */
  constructor(options: ConnectionRegistryOptions = {}) {
    super();
    this.maxConnections = options.maxConnections ?? 20;
    this.connectionManagerOptions = options.connectionManagerOptions ?? {};
  }

  /**
   * Create a new connection and connect to the target server.
   *
   * @param params - Connection parameters (transport type + config).
   * @param options - Connection options passed to the ConnectionManager.
   * @returns The new connection id and manager instance.
   */
  async createConnection(
    params: ConnectionParams,
    options?: ConnectOptions
  ): Promise<{ id: string; connectionManager: ConnectionManager }> {
    if (this.connections.size >= this.maxConnections) {
      throw new Error(`Max connections limit (${this.maxConnections}) reached.`);
    }

    const id = this.generateConnectionId();
    const connectionManager = new ConnectionManager({
      ...this.connectionManagerOptions,
      id,
    });

    try {
      await connectionManager.connect(params, options);
    } catch (error) {
      try {
        await connectionManager.disconnect();
      } catch {
        // Best-effort cleanup
      }
      throw error;
    }

    this.connections.set(id, connectionManager);
    this.emit("created", id, connectionManager);
    this.setActive(id);

    return { id, connectionManager };
  }

  /**
   * Get a connection by ID.
   *
   * @param id - Connection id to look up.
   * @returns The ConnectionManager for the id.
   * @throws If the connection cannot be found.
   */
  getConnection(id: string): ConnectionManager {
    const connection = this.connections.get(id);
    if (!connection) {
      throw new Error(`Connection not found: ${id}`);
    }
    return connection;
  }

  /**
   * Get the active connection.
   *
   * @returns The active ConnectionManager.
   * @throws If no active connection exists.
   */
  getActiveConnection(): ConnectionManager {
    if (!this.activeConnectionId) {
      throw new Error("No active connection available.");
    }
    return this.getConnection(this.activeConnectionId);
  }

  /**
   * Resolve a connection: explicit id > active > throw.
   *
   * **Side effect:** When an explicit `connectionId` is provided, that
   * connection becomes the new active connection. This ensures the "last
   * used" connection is always active, matching the expected agent workflow
   * (tools target a specific connection, which then becomes the default
   * for subsequent calls without an explicit id).
   *
   * @param connectionId - Optional connection id to resolve.
   * @returns The resolved ConnectionManager.
   * @throws If the connection id is invalid or no active connection exists.
   */
  resolveConnection(connectionId?: string): ConnectionManager {
    if (connectionId) {
      const connection = this.getConnection(connectionId);
      this.setActive(connectionId);
      return connection;
    }

    return this.getActiveConnection();
  }

  /**
   * Close and remove a connection.
   *
   * @param id - Connection id to close.
   */
  async closeConnection(id: string): Promise<void> {
    const connectionIds = Array.from(this.connections.keys());
    const closingIndex = connectionIds.indexOf(id);
    const connection = this.getConnection(id);
    await connection.disconnect();
    this.connections.delete(id);

    if (this.activeConnectionId === id) {
      const remaining = Array.from(this.connections.keys());
      if (remaining.length === 0) {
        this.activeConnectionId = null;
      } else if (closingIndex >= 0 && closingIndex < connectionIds.length - 1) {
        this.activeConnectionId = connectionIds[closingIndex + 1] ?? remaining[0] ?? null;
      } else {
        this.activeConnectionId = connectionIds[closingIndex - 1] ?? remaining[0] ?? null;
      }
    }

    this.emit("closed", id);
  }

  /**
   * List all connections with status.
   *
   * @returns Snapshot of connection status objects.
   */
  listConnections(): ConnectionInfo[] {
    return Array.from(this.connections.entries()).map(([id, connection]) => {
      const state = connection.getState();
      const oauthState = connection.getOAuthState();
      const info: ConnectionInfo = {
        id,
        connected: state.connected,
        serverUrl: state.serverUrl,
        serverInfo: state.serverInfo,
        historyEnabled: state.historyEnabled,
        callCount: state.callCount,
        ...(oauthState ? { oauth: oauthState } : {}),
      };
      return info;
    });
  }

  /**
   * Set the active connection by id.
   *
   * @param id - Connection id to activate.
   * @throws If the connection id is not registered.
   */
  setActive(id: string): void {
    if (this.activeConnectionId === id) {
      return;
    }

    if (!this.connections.has(id)) {
      throw new Error(`Connection not found: ${id}`);
    }

    this.activeConnectionId = id;
    this.emit("activated", id);
  }

  /**
   * Close all active connections.
   */
  async closeAll(): Promise<void> {
    const ids = Array.from(this.connections.keys());
    for (const id of ids) {
      await this.closeConnection(id);
    }
  }

  private generateConnectionId(): string {
    return randomUUID();
  }
}
