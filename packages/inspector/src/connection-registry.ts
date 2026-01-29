/**
 * Connection registry for MCP Inspector Server
 *
 * Manages multiple ConnectionManager instances and tracks active connection.
 */

import { EventEmitter } from "node:events";
import { ConnectionManager } from "./connection";
import type { ConnectOptions, ConnectionStatusOutput, InspectorServerOptions } from "./types";

export interface ConnectionRegistryEvents {
  /** Emitted when a new connection is created */
  created: [id: string, connectionManager: ConnectionManager];
  /** Emitted when a connection is closed */
  closed: [id: string];
  /** Emitted when a connection is activated */
  activated: [id: string];
}

export interface ConnectionRegistryOptions {
  /** Maximum number of concurrent connections. Default: 20 */
  maxConnections?: number;
  /** Base options for each ConnectionManager instance */
  connectionManagerOptions?: InspectorServerOptions;
}

export interface ConnectionInfo extends ConnectionStatusOutput {
  id: string;
}

export class ConnectionRegistry extends EventEmitter {
  private readonly connections: Map<string, ConnectionManager> = new Map();
  private activeConnectionId: string | null = null;
  private readonly maxConnections: number;
  private readonly connectionManagerOptions: InspectorServerOptions;
  private nextId = 1;

  constructor(options: ConnectionRegistryOptions = {}) {
    super();
    this.maxConnections = options.maxConnections ?? 20;
    this.connectionManagerOptions = options.connectionManagerOptions ?? {};
  }

  /**
   * Create a new connection and connect to the target server.
   */
  async createConnection(
    url: string,
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
      await connectionManager.connect(url, options);
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
   * Get a connection by ID (throws if not found)
   */
  getConnection(id: string): ConnectionManager {
    const connection = this.connections.get(id);
    if (!connection) {
      throw new Error(`Connection not found: ${id}`);
    }
    return connection;
  }

  /**
   * Get the active connection (throws if none)
   */
  getActiveConnection(): ConnectionManager {
    if (!this.activeConnectionId) {
      throw new Error("No active connection available.");
    }
    return this.getConnection(this.activeConnectionId);
  }

  /**
   * Resolve a connection: explicit ID > active > throw
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
   * Close and remove a connection
   */
  async closeConnection(id: string): Promise<void> {
    const connection = this.getConnection(id);
    await connection.disconnect();
    this.connections.delete(id);

    if (this.activeConnectionId === id) {
      this.activeConnectionId = null;
    }

    this.emit("closed", id);
  }

  /**
   * List all connections with status
   */
  listConnections(): ConnectionInfo[] {
    return Array.from(this.connections.entries()).map(([id, connection]) => {
      const state = connection.getState();
      const info: ConnectionInfo = {
        id,
        connected: state.connected,
        serverUrl: state.serverUrl,
        serverInfo: state.serverInfo,
        historyEnabled: state.historyEnabled,
        callCount: state.callCount,
      };
      return info;
    });
  }

  /**
   * Track which connection was last used
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
   * Close all connections
   */
  async closeAll(): Promise<void> {
    const ids = Array.from(this.connections.keys());
    for (const id of ids) {
      await this.closeConnection(id);
    }
  }

  private generateConnectionId(): string {
    return `conn-${this.nextId++}`;
  }
}
