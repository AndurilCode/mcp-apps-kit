/**
 * External MCP tool client
 *
 * @module workflow/external-client
 */

import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ExternalToolError } from "./errors";
import { debugLogger } from "../debug/logger";

// =============================================================================
// INPUT VALIDATION
// =============================================================================

/**
 * Schema for validating tool input
 * Ensures input is a plain object (not null, array, or primitive)
 */
const toolInputSchema = z.record(z.string(), z.unknown()).refine(
  (val) => {
    // Ensure it's a plain object, not an array
    return typeof val === "object" && val !== null && !Array.isArray(val);
  },
  {
    message: "Tool input must be a plain object (not null, array, or primitive)",
  }
);

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
 * Configuration options for ExternalToolClient
 */
export interface ExternalToolClientConfig {
  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTTL?: number;
  /** Maximum number of concurrent connections (default: 10) */
  maxConnections?: number;
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
  private readonly CACHE_TTL: number;
  private readonly MAX_CONNECTIONS: number;
  private cleanupInterval?: ReturnType<typeof setInterval>;

  /**
   * Create a new ExternalToolClient
   *
   * @param config - Optional configuration for cache behavior
   */
  constructor(config: ExternalToolClientConfig = {}) {
    this.CACHE_TTL = config.cacheTTL ?? 5 * 60 * 1000; // Default: 5 minutes
    this.MAX_CONNECTIONS = config.maxConnections ?? 10; // Default: 10

    // Start automatic cleanup interval (only in Node.js environments)
    // Edge environments should use manual cleanup or shorter-lived clients
    if (typeof setInterval !== "undefined" && typeof process !== "undefined") {
      // Run cleanup every CACHE_TTL period
      this.cleanupInterval = setInterval(() => {
        void this.cleanupStaleConnections();
      }, this.CACHE_TTL);

      // Don't prevent process from exiting
      if (this.cleanupInterval.unref) {
        this.cleanupInterval.unref();
      }
    }
  }

  /**
   * Call a tool on an external MCP server
   *
   * @param server - MCP server URL or identifier
   * @param toolName - Name of the tool to call
   * @param input - Input for the tool
   * @returns Tool output
   *
   * @remarks
   * This method attempts to extract structured content from the tool response.
   * If the response includes `structuredContent`, it is returned directly.
   * Otherwise, the method falls back to parsing text content:
   * - Locates the first text content item in the response
   * - Attempts to parse it as JSON
   * - Returns the raw text if JSON parsing fails
   * - Returns `undefined` if no content is found
   */
  async callTool(server: string, toolName: string, input: unknown): Promise<unknown> {
    // Validate input is a plain object
    const validationResult = toolInputSchema.safeParse(input);
    if (!validationResult.success) {
      throw new ExternalToolError(
        `Invalid input for tool "${toolName}" on server "${server}": ${validationResult.error.message}`,
        server,
        toolName,
        { validationError: validationResult.error, providedInput: input }
      );
    }

    try {
      const client = await this.getOrCreateConnection(server);

      // Call the tool with validated input
      const response = await client.callTool(
        {
          name: toolName,
          arguments: validationResult.data,
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
      // If error is already an ExternalToolError, rethrow it unchanged to avoid double-wrapping
      if (error instanceof ExternalToolError) {
        throw error;
      }

      // Wrap other errors in ExternalToolError with context
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

    // Atomically get or create pending connection to prevent race conditions
    let pending = this.pendingConnections.get(server);
    if (!pending) {
      // Evict old connections if cache is full (before creating new promise)
      if (this.connections.size >= this.MAX_CONNECTIONS) {
        await this.evictOldConnections();
      }

      // Create new connection promise and atomically store it
      pending = this.createConnectionWithTransport(server);
      this.pendingConnections.set(server, pending);

      // Set up cleanup in a non-blocking way
      void pending
        .then(({ client, transport }) => {
          // Cache the connection with the actual transport for cleanup
          this.connections.set(server, {
            client,
            transport,
            lastUsed: Date.now(),
          });
        })
        .catch(() => {
          // Error will be thrown to awaiting callers, just clean up here
        })
        .finally(() => {
          // Always remove from pending, whether success or failure
          this.pendingConnections.delete(server);
        });
    }

    // Wait for the connection (either existing or newly created)
    const { client } = await pending;

    // Update timestamp for concurrent access to prevent premature eviction
    const nowCached = this.connections.get(server);
    if (nowCached) {
      nowCached.lastUsed = Date.now();
    }

    return client;
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
   * Clean up stale connections that haven't been used within the TTL
   *
   * Called automatically by the cleanup interval (in Node.js environments)
   * or can be called manually for explicit cache management.
   */
  private async cleanupStaleConnections(): Promise<void> {
    const now = Date.now();
    const toEvict: string[] = [];

    // Find connections older than TTL
    for (const [server, connection] of this.connections.entries()) {
      if (now - connection.lastUsed > this.CACHE_TTL) {
        toEvict.push(server);
      }
    }

    // Evict stale connections
    if (toEvict.length > 0) {
      debugLogger.debug("Cleaning up stale MCP connections", {
        count: toEvict.length,
        servers: toEvict,
      });

      for (const server of toEvict) {
        const connection = this.connections.get(server);
        if (connection) {
          await this.closeConnection(connection, server);
          this.connections.delete(server);
        }
      }
    }
  }

  /**
   * Evict old connections from cache to make room for new ones
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
        await this.closeConnection(connection, server);
        this.connections.delete(server);
      }
    }
  }

  /**
   * Close a connection with fallback transport cleanup
   */
  private async closeConnection(connection: CachedConnection, server?: string): Promise<void> {
    try {
      await connection.client.close();
    } catch (error) {
      debugLogger.warn("Failed to close MCP client connection", { error, server });

      // If Client.close() fails, attempt to close the transport directly
      try {
        await connection.transport.close();
      } catch (transportError) {
        // Log and continue - we've made our best effort at cleanup
        debugLogger.error("Failed to close MCP transport", {
          error: transportError,
          server,
          transportType: connection.transport instanceof StdioClientTransport ? "stdio" : "http",
        });
      }
    }
  }

  /**
   * Close all connections and stop cleanup interval
   */
  async closeAll(): Promise<void> {
    // Stop the cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    // Close all active connections
    for (const [server, connection] of this.connections.entries()) {
      await this.closeConnection(connection, server);
    }
    this.connections.clear();
  }
}
