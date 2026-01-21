/**
 * External MCP tool client
 *
 * @module workflow/external-client
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ExternalToolError } from "./errors";

// =============================================================================
// CONNECTION CACHE
// =============================================================================

type Transport = StdioClientTransport | StreamableHTTPClientTransport;

interface CachedConnection {
  client: Client;
  transport: Transport;
  lastUsed: number;
}

/**
 * External tool client with connection caching
 *
 * Manages connections to external MCP servers and provides
 * a simple interface for calling tools on those servers.
 */
export class ExternalToolClient {
  private connections: Map<string, CachedConnection> = new Map();
  private pendingConnections: Map<string, Promise<{ client: Client; transport: Transport }>> =
    new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CONNECTIONS = 10;

  /**
   * Call a tool on an external MCP server
   *
   * @param server - MCP server URL or identifier
   * @param toolName - Name of the tool to call
   * @param input - Input for the tool
   * @returns Tool output
   */
  async callTool(server: string, toolName: string, input: unknown): Promise<unknown> {
    try {
      const client = await this.getOrCreateConnection(server);

      // Call the tool
      const response = await client.callTool(
        {
          name: toolName,
          arguments: input as Record<string, unknown>,
        },
        undefined
      );

      // Extract structured content from response
      if (response.structuredContent) {
        return response.structuredContent;
      }

      // Fallback to parsing text content if no structured content
      if (response.content && Array.isArray(response.content) && response.content.length > 0) {
        const textContent = response.content.find(
          (c: unknown) => typeof c === "object" && c !== null && "type" in c && c.type === "text"
        ) as { text?: string } | undefined;

        if (textContent && typeof textContent.text === "string") {
          try {
            return JSON.parse(textContent.text);
          } catch {
            return textContent.text;
          }
        }
      }

      return undefined;
    } catch (error) {
      throw new ExternalToolError(
        `Failed to call tool "${toolName}" on server "${server}": ${(error as Error).message}`,
        server,
        toolName,
        { originalError: error }
      );
    }
  }

  /**
   * Get or create a connection to an external server
   *
   * Handles race conditions: if multiple concurrent calls request the same server,
   * they will share the same connection promise to prevent creating duplicate connections.
   */
  private async getOrCreateConnection(server: string): Promise<Client> {
    // Check if we have a cached connection
    const cached = this.connections.get(server);
    if (cached) {
      // Update last used timestamp
      cached.lastUsed = Date.now();
      return cached.client;
    }

    // Check if a connection is already being created for this server
    const pending = this.pendingConnections.get(server);
    if (pending) {
      // Wait for the existing connection attempt and return its client
      const { client } = await pending;
      return client;
    }

    // Evict old connections if cache is full
    if (this.connections.size >= this.MAX_CONNECTIONS) {
      await this.evictOldConnections();
    }

    // Create new connection promise and track it
    const connectionPromise = this.createConnectionWithTransport(server);
    this.pendingConnections.set(server, connectionPromise);

    try {
      // Await the connection
      const { client, transport } = await connectionPromise;

      // Cache the connection with the actual transport for cleanup
      this.connections.set(server, {
        client,
        transport,
        lastUsed: Date.now(),
      });

      return client;
    } finally {
      // Always remove from pending, whether success or failure
      this.pendingConnections.delete(server);
    }
  }

  /**
   * Create a new MCP client connection with transport
   *
   * Supports both stdio and HTTP transports:
   * - stdio: mcp://server-name or server-name (command in PATH)
   * - HTTP: http://... or https://...
   *
   * @returns Both the client and transport for proper lifecycle management
   */
  private async createConnectionWithTransport(
    server: string
  ): Promise<{ client: Client; transport: Transport }> {
    let transport: Transport;

    // Determine transport type based on server identifier
    if (server.startsWith("http://") || server.startsWith("https://")) {
      // HTTP transport for remote servers
      transport = new StreamableHTTPClientTransport(new URL(server));
    } else {
      // Stdio transport for local MCP servers
      // Parse server identifier (remove mcp:// prefix if present)
      const serverName = server.replace(/^mcp:\/\//, "");

      transport = new StdioClientTransport({
        command: serverName,
        args: [],
      });
    }

    // Create client
    const client = new Client(
      {
        name: "workflow-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    // Connect to server
    await client.connect(transport);

    return { client, transport };
  }

  /**
   * Evict old connections from cache
   */
  private async evictOldConnections(): Promise<void> {
    const now = Date.now();
    const toEvict: string[] = [];

    // Find connections older than TTL
    for (const [server, connection] of this.connections.entries()) {
      if (now - connection.lastUsed > this.CACHE_TTL) {
        toEvict.push(server);
      }
    }

    // If no old connections, evict the least recently used
    if (toEvict.length === 0 && this.connections.size > 0) {
      let oldestServer: string | undefined;
      let oldestTime = Infinity;

      for (const [server, connection] of this.connections.entries()) {
        if (connection.lastUsed < oldestTime) {
          oldestTime = connection.lastUsed;
          oldestServer = server;
        }
      }

      if (oldestServer) {
        toEvict.push(oldestServer);
      }
    }

    // Evict connections
    for (const server of toEvict) {
      const connection = this.connections.get(server);
      if (connection) {
        await this.closeConnection(connection);
        this.connections.delete(server);
      }
    }
  }

  /**
   * Close a connection with fallback transport cleanup
   */
  private async closeConnection(connection: CachedConnection): Promise<void> {
    try {
      await connection.client.close();
    } catch {
      // If Client.close() fails, attempt to close the transport directly
      try {
        await connection.transport.close();
      } catch {
        // Transport close also failed - for stdio transport, try to kill the process
        if (connection.transport instanceof StdioClientTransport) {
          // StdioClientTransport has internal process management
          // The close() call above should handle it, but if it doesn't,
          // we've done our best effort
        }
        // Swallow the error - we've attempted cleanup
      }
    }
  }

  /**
   * Close all connections
   */
  async closeAll(): Promise<void> {
    for (const connection of this.connections.values()) {
      await this.closeConnection(connection);
    }
    this.connections.clear();
  }
}
