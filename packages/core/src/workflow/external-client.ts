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
   */
  private async getOrCreateConnection(server: string): Promise<Client> {
    // Check if we have a cached connection
    const cached = this.connections.get(server);
    if (cached) {
      // Update last used timestamp
      cached.lastUsed = Date.now();
      return cached.client;
    }

    // Evict old connections if cache is full
    if (this.connections.size >= this.MAX_CONNECTIONS) {
      this.evictOldConnections();
    }

    // Create new connection
    const client = await this.createConnection(server);

    // Cache the connection
    // Note: transport is managed by the client, we just keep a reference for cleanup
    this.connections.set(server, {
      client,
      transport: null as never, // Transport reference (managed by client)
      lastUsed: Date.now(),
    });

    return client;
  }

  /**
   * Create a new MCP client connection
   *
   * Supports both stdio and HTTP transports:
   * - stdio: mcp://server-name or server-name (command in PATH)
   * - HTTP: http://... or https://...
   */
  private async createConnection(server: string): Promise<Client> {
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

    return client;
  }

  /**
   * Evict old connections from cache
   */
  private evictOldConnections(): void {
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
        // Close the connection
        void connection.client.close();
        this.connections.delete(server);
      }
    }
  }

  /**
   * Close all connections
   */
  async closeAll(): Promise<void> {
    for (const connection of this.connections.values()) {
      await connection.client.close();
    }
    this.connections.clear();
  }
}
