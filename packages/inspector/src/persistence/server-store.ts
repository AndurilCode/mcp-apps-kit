/**
 * Server Store for MCP Inspector
 *
 * Persists server configurations to XDG-compliant path:
 *   ~/.config/mcp-inspector/servers.json
 *
 * All operations are atomic (write-to-temp then rename) to prevent corruption.
 * File permissions: 0o600 (file), 0o700 (directory).
 */

import { readFile, writeFile, mkdir, rename, chmod, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ConnectionParams } from "@mcp-apps-kit/testing";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Transport type for persisted servers.
 */
export type ServerTransport = "http" | "stdio";

/**
 * Persisted server entry.
 *
 * Stored in ~/.config/mcp-inspector/servers.json
 */
export interface PersistedServerEntry {
  /** Unique server ID (UUID format) */
  id: string;

  /** Server name from MCP serverInfo.name handshake */
  name: string;

  /** Server URL (for http) or command (for stdio) */
  url: string;

  /** Transport type */
  transport: ServerTransport;

  /** Full connection parameters (url for http, command+args+env for stdio) */
  params: ConnectionParams;

  /** Whether this server has OAuth tokens stored */
  hasOAuth: boolean;

  /** Timestamp when the server was added (ms since epoch) */
  addedAt: number;
}

/**
 * Data format for the servers.json file.
 */
export interface PersistedServersData {
  /** Schema version for future migrations */
  version: 1;

  /** Persisted server entries keyed by ID */
  servers: Record<string, PersistedServerEntry>;
}

/**
 * LocalStorage migration payload from frontend.
 *
 * The frontend sends an array of server entries from localStorage.
 */
export interface LocalStorageMigrationPayload {
  servers: PersistedServerEntry[];
}

// =============================================================================
// PATH HELPERS
// =============================================================================

/**
 * Get the XDG-compliant config directory for MCP Inspector.
 *
 * Resolution order:
 * 1. XDG_CONFIG_HOME environment variable
 * 2. ~/.config (POSIX default)
 * 3. os.tmpdir() as last resort (e.g., in CI)
 *
 * @returns Absolute path to the mcp-inspector config directory
 */
export function getConfigDir(): string {
  const xdgConfig = process.env["XDG_CONFIG_HOME"];
  const home = process.env["HOME"] ?? process.env["USERPROFILE"];

  let configBase: string;
  if (xdgConfig) {
    configBase = xdgConfig;
  } else if (home) {
    configBase = join(home, ".config");
  } else {
    configBase = join(tmpdir(), ".config");
  }

  return join(configBase, "mcp-inspector");
}

/**
 * Get the path to the servers.json file.
 *
 * @param configDir - Optional override for the config directory
 * @returns Absolute path to servers.json
 */
export function getServersFilePath(configDir?: string): string {
  return join(configDir ?? getConfigDir(), "servers.json");
}

// =============================================================================
// SERVER STORE CLASS
// =============================================================================

/**
 * Server store for persisting server configurations.
 *
 * Stores all servers in a single JSON file for simplicity.
 * Uses atomic writes (temp file + rename) to prevent corruption.
 */
export class ServerStore {
  private readonly configDir: string;
  private readonly filePath: string;

  /**
   * Create a ServerStore instance.
   *
   * @param configDir - Optional override for the config directory (for testing)
   */
  constructor(configDir?: string) {
    this.configDir = configDir ?? getConfigDir();
    this.filePath = getServersFilePath(this.configDir);
  }

  /**
   * Ensure the config directory exists with proper permissions.
   */
  private async ensureDir(): Promise<void> {
    await mkdir(this.configDir, { recursive: true, mode: 0o700 });

    // Ensure permissions are correct even if directory existed
    try {
      await chmod(this.configDir, 0o700);
    } catch {
      // Ignore errors on permission change (may fail on some filesystems)
    }
  }

  /**
   * Load the raw persisted data from disk.
   *
   * @returns Parsed data or a fresh empty structure if file doesn't exist
   */
  private async loadRaw(): Promise<PersistedServersData> {
    try {
      const content = await readFile(this.filePath, "utf-8");
      const data = JSON.parse(content) as PersistedServersData;

      // Validate basic structure
      if (typeof data !== "object" || data === null) {
        return this.emptyData();
      }

      // Handle version migration if needed in the future
      if (data.version !== 1) {
        return this.emptyData();
      }

      if (!data.servers || typeof data.servers !== "object") {
        return this.emptyData();
      }

      return data;
    } catch {
      return this.emptyData();
    }
  }

  /**
   * Write data atomically to disk.
   *
   * Uses temp file + rename to prevent corruption.
   *
   * @param data - Data to persist
   */
  private async writeRaw(data: PersistedServersData): Promise<void> {
    await this.ensureDir();

    const tmpPath = `${this.filePath}.tmp.${process.pid}`;
    const content = JSON.stringify(data, null, 2);

    await writeFile(tmpPath, content, { encoding: "utf-8", mode: 0o600 });

    // Atomic rename
    await rename(tmpPath, this.filePath);
  }

  /**
   * Create an empty data structure.
   */
  private emptyData(): PersistedServersData {
    return { version: 1, servers: {} };
  }

  /**
   * Load a server by ID.
   *
   * @param id - Server ID to load
   * @returns Server entry or undefined if not found
   */
  async load(id: string): Promise<PersistedServerEntry | undefined> {
    const data = await this.loadRaw();
    return data.servers[id];
  }

  /**
   * Save a server entry.
   *
   * Creates or updates the entry.
   *
   * @param entry - Server entry to persist
   */
  async save(entry: PersistedServerEntry): Promise<void> {
    const data = await this.loadRaw();
    data.servers[entry.id] = entry;
    await this.writeRaw(data);
  }

  /**
   * Delete a server by ID.
   *
   * @param id - Server ID to delete
   * @returns true if server was deleted, false if not found
   */
  async delete(id: string): Promise<boolean> {
    const data = await this.loadRaw();

    if (!data.servers[id]) {
      return false;
    }

    delete data.servers[id];
    await this.writeRaw(data);
    return true;
  }

  /**
   * List all persisted servers.
   *
   * @returns Array of all server entries
   */
  async listAll(): Promise<PersistedServerEntry[]> {
    const data = await this.loadRaw();
    return Object.values(data.servers);
  }

  /**
   * Migrate servers from localStorage format.
   *
   * Used during frontend migration from localStorage to backend persistence.
   * Merges incoming servers with existing ones (new servers take precedence
   * for duplicate IDs).
   *
   * @param payload - Migration payload containing servers from localStorage
   * @returns Number of servers imported
   */
  async migrate(payload: LocalStorageMigrationPayload): Promise<number> {
    if (!Array.isArray(payload.servers)) {
      return 0;
    }

    const data = await this.loadRaw();
    let count = 0;

    for (const server of payload.servers) {
      // Validate required fields
      if (
        typeof server.id !== "string" ||
        typeof server.name !== "string" ||
        typeof server.url !== "string" ||
        typeof server.transport !== "string" ||
        !server.params
      ) {
        continue;
      }

      // Validate transport type
      if (server.transport !== "http" && server.transport !== "stdio") {
        continue;
      }

      data.servers[server.id] = {
        id: server.id,
        name: server.name,
        url: server.url,
        transport: server.transport,
        params: server.params,
        hasOAuth: Boolean(server.hasOAuth),
        addedAt: server.addedAt ?? Date.now(),
      };
      count++;
    }

    if (count > 0) {
      await this.writeRaw(data);
    }

    return count;
  }

  /**
   * Check if the store has any servers.
   *
   * @returns true if store is empty
   */
  async isEmpty(): Promise<boolean> {
    const data = await this.loadRaw();
    return Object.keys(data.servers).length === 0;
  }

  /**
   * Clear all servers (for testing).
   */
  async clear(): Promise<void> {
    await this.writeRaw(this.emptyData());
  }

  /**
   * Get the config directory path (for debugging/display).
   */
  getConfigDir(): string {
    return this.configDir;
  }

  /**
   * Get the file path (for debugging/display).
   */
  getFilePath(): string {
    return this.filePath;
  }

  /**
   * Check if the servers.json file exists.
   *
   * @returns true if file exists
   */
  async exists(): Promise<boolean> {
    try {
      await stat(this.filePath);
      return true;
    } catch {
      return false;
    }
  }
}
