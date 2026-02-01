/**
 * Token Store for MCP Inspector
 *
 * Persists OAuth tokens per-server-URL at XDG-compliant path:
 *   ~/.config/mcp-inspector/tokens/<url-hash>.json
 *
 * Uses SHA-256 hash of the server URL as filename to avoid filesystem issues.
 * All operations are atomic (write-to-temp then rename) to prevent corruption.
 */

import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, unlink, readdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import type {
  OAuthTokens,
  OAuthClientInformationFull,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { PersistedTokenData } from "./types";

/**
 * Get the XDG-compliant token storage directory.
 *
 * Resolution order:
 * 1. XDG_CONFIG_HOME environment variable
 * 2. ~/.config (POSIX default)
 * 3. os.tmpdir() as last resort (e.g. in CI)
 *
 * @returns Absolute path to the tokens directory
 */
export function getTokenStorePath(): string {
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

  return join(configBase, "mcp-inspector", "tokens");
}

/**
 * Hash a server URL to a filesystem-safe filename.
 *
 * @param serverUrl - The server URL to hash
 * @returns SHA-256 hex hash of the URL
 */
export function hashServerUrl(serverUrl: string): string {
  return createHash("sha256").update(serverUrl).digest("hex");
}

/**
 * Token store for persisting OAuth tokens per server URL.
 */
export class TokenStore {
  private readonly storePath: string;

  constructor(storePath?: string) {
    this.storePath = storePath ?? getTokenStorePath();
  }

  /**
   * Ensure the token store directory exists.
   */
  private async ensureDir(): Promise<void> {
    if (!existsSync(this.storePath)) {
      await mkdir(this.storePath, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Get the file path for a server URL's token data.
   */
  private getFilePath(serverUrl: string): string {
    return join(this.storePath, `${hashServerUrl(serverUrl)}.json`);
  }

  /**
   * Load persisted token data for a server URL.
   *
   * @param serverUrl - The server URL to load tokens for
   * @returns Persisted token data, or undefined if none exists
   */
  async load(serverUrl: string): Promise<PersistedTokenData | undefined> {
    const filePath = this.getFilePath(serverUrl);
    try {
      const content = await readFile(filePath, "utf-8");
      const data = JSON.parse(content) as PersistedTokenData;
      // Validate basic structure
      if (!data.serverUrl || !data.tokens) {
        return undefined;
      }
      return data;
    } catch {
      return undefined;
    }
  }

  /**
   * Save token data for a server URL.
   *
   * Uses atomic write (temp file + rename) to prevent corruption.
   *
   * @param serverUrl - The server URL to save tokens for
   * @param data - Partial token data to merge with existing data
   */
  async save(serverUrl: string, data: Partial<PersistedTokenData>): Promise<void> {
    await this.ensureDir();

    const existing = await this.load(serverUrl);
    const merged: PersistedTokenData = {
      serverUrl,
      tokens:
        data.tokens ??
        existing?.tokens ??
        ({ access_token: "", token_type: "bearer" } as OAuthTokens),
      codeVerifier: data.codeVerifier ?? existing?.codeVerifier,
      clientInformation: data.clientInformation ?? existing?.clientInformation,
      requestedScopes: data.requestedScopes ?? existing?.requestedScopes,
      savedAt: Date.now(),
    };

    const filePath = this.getFilePath(serverUrl);
    const tmpPath = `${filePath}.tmp.${process.pid}`;

    const content = JSON.stringify(merged, null, 2);
    await writeFile(tmpPath, content, { encoding: "utf-8", mode: 0o600 });

    // Atomic rename
    const { rename } = await import("node:fs/promises");
    await rename(tmpPath, filePath);
  }

  /**
   * Save only tokens (convenience method for token refresh).
   */
  async saveTokens(serverUrl: string, tokens: OAuthTokens): Promise<void> {
    await this.save(serverUrl, { tokens });
  }

  /**
   * Save only client information (convenience method for dynamic registration).
   */
  async saveClientInformation(
    serverUrl: string,
    clientInfo: OAuthClientInformationFull
  ): Promise<void> {
    await this.save(serverUrl, { clientInformation: clientInfo });
  }

  /**
   * Save only the PKCE code verifier.
   */
  async saveCodeVerifier(serverUrl: string, codeVerifier: string): Promise<void> {
    await this.save(serverUrl, { codeVerifier });
  }

  /**
   * Delete persisted data for a server URL.
   *
   * @param serverUrl - The server URL to delete tokens for
   * @returns true if data was deleted, false if none existed
   */
  async delete(serverUrl: string): Promise<boolean> {
    const filePath = this.getFilePath(serverUrl);
    try {
      await unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all server URLs with persisted tokens.
   *
   * @returns Array of persisted token data entries
   */
  async listAll(): Promise<PersistedTokenData[]> {
    try {
      const files = await readdir(this.storePath);
      const results: PersistedTokenData[] = [];

      for (const file of files) {
        if (!file.endsWith(".json") || file.includes(".tmp.")) continue;
        try {
          const content = await readFile(join(this.storePath, file), "utf-8");
          const data = JSON.parse(content) as PersistedTokenData;
          if (data.serverUrl && data.tokens) {
            results.push(data);
          }
        } catch {
          // Skip corrupted files
        }
      }

      return results;
    } catch {
      return [];
    }
  }

  /**
   * Get the storage directory path (for debugging/display).
   */
  getStorePath(): string {
    return this.storePath;
  }
}
