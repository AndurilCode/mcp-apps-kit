/**
 * Token Store tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TokenStore, hashServerUrl, getTokenStorePath } from "../src/oauth/token-store";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

describe("TokenStore", () => {
  let tempDir: string;
  let store: TokenStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "token-store-test-"));
    store = new TokenStore(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("hashServerUrl", () => {
    it("should produce consistent hashes", () => {
      const hash1 = hashServerUrl("http://localhost:3000/mcp");
      const hash2 = hashServerUrl("http://localhost:3000/mcp");
      expect(hash1).toBe(hash2);
    });

    it("should produce different hashes for different URLs", () => {
      const hash1 = hashServerUrl("http://localhost:3000/mcp");
      const hash2 = hashServerUrl("http://localhost:4000/mcp");
      expect(hash1).not.toBe(hash2);
    });

    it("should produce hex strings", () => {
      const hash = hashServerUrl("http://example.com");
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("getTokenStorePath", () => {
    it("should return a path ending with mcp-inspector/tokens", () => {
      const path = getTokenStorePath();
      expect(path).toContain("mcp-inspector");
      expect(path).toContain("tokens");
    });
  });

  describe("save and load", () => {
    const serverUrl = "http://localhost:3000/mcp";
    const tokens: OAuthTokens = {
      access_token: "test-access-token",
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: "test-refresh-token",
    };

    it("should save and load tokens", async () => {
      await store.save(serverUrl, { tokens });

      const loaded = await store.load(serverUrl);
      expect(loaded).toBeDefined();
      expect(loaded!.tokens.access_token).toBe("test-access-token");
      expect(loaded!.tokens.refresh_token).toBe("test-refresh-token");
      expect(loaded!.serverUrl).toBe(serverUrl);
      expect(loaded!.savedAt).toBeGreaterThan(0);
    });

    it("should return undefined for non-existent server URL", async () => {
      const loaded = await store.load("http://nonexistent:9999");
      expect(loaded).toBeUndefined();
    });

    it("should save code verifier", async () => {
      await store.saveCodeVerifier(serverUrl, "test-verifier-abc");

      const loaded = await store.load(serverUrl);
      expect(loaded).toBeDefined();
      expect(loaded!.codeVerifier).toBe("test-verifier-abc");
    });

    it("should save client information", async () => {
      const clientInfo = {
        client_id: "test-client-id",
        client_secret: "test-client-secret",
        redirect_uris: [new URL("http://localhost/callback")],
      };

      await store.saveClientInformation(serverUrl, clientInfo as never);

      const loaded = await store.load(serverUrl);
      expect(loaded).toBeDefined();
      expect(loaded!.clientInformation?.client_id).toBe("test-client-id");
    });

    it("should merge saves (not overwrite)", async () => {
      await store.save(serverUrl, { tokens });
      await store.saveCodeVerifier(serverUrl, "verifier-123");

      const loaded = await store.load(serverUrl);
      expect(loaded).toBeDefined();
      expect(loaded!.tokens.access_token).toBe("test-access-token");
      expect(loaded!.codeVerifier).toBe("verifier-123");
    });

    it("should save requested scopes", async () => {
      await store.save(serverUrl, { tokens, requestedScopes: "read write" });

      const loaded = await store.load(serverUrl);
      expect(loaded!.requestedScopes).toBe("read write");
    });
  });

  describe("saveTokens", () => {
    it("should update only tokens", async () => {
      const serverUrl = "http://localhost:3000/mcp";

      // Save initial data with code verifier
      await store.saveCodeVerifier(serverUrl, "verifier-1");

      // Save tokens using convenience method
      const tokens: OAuthTokens = {
        access_token: "new-token",
        token_type: "bearer",
      };
      await store.saveTokens(serverUrl, tokens);

      const loaded = await store.load(serverUrl);
      expect(loaded!.tokens.access_token).toBe("new-token");
      expect(loaded!.codeVerifier).toBe("verifier-1"); // preserved
    });
  });

  describe("delete", () => {
    it("should delete existing data", async () => {
      const serverUrl = "http://localhost:3000/mcp";
      await store.save(serverUrl, {
        tokens: { access_token: "x", token_type: "bearer" } as OAuthTokens,
      });

      const deleted = await store.delete(serverUrl);
      expect(deleted).toBe(true);

      const loaded = await store.load(serverUrl);
      expect(loaded).toBeUndefined();
    });

    it("should return false for non-existent data", async () => {
      const deleted = await store.delete("http://nonexistent:9999");
      expect(deleted).toBe(false);
    });
  });

  describe("listAll", () => {
    it("should list all persisted entries", async () => {
      const tokens: OAuthTokens = {
        access_token: "token-1",
        token_type: "bearer",
      };

      await store.save("http://server1.com/mcp", { tokens });
      await store.save("http://server2.com/mcp", {
        tokens: { ...tokens, access_token: "token-2" },
      });

      const all = await store.listAll();
      expect(all).toHaveLength(2);
      expect(all.map((e) => e.serverUrl).sort()).toEqual([
        "http://server1.com/mcp",
        "http://server2.com/mcp",
      ]);
    });

    it("should return empty array when no data exists", async () => {
      const all = await store.listAll();
      expect(all).toHaveLength(0);
    });

    it("should skip temp files", async () => {
      const tokens: OAuthTokens = {
        access_token: "token",
        token_type: "bearer",
      };
      await store.save("http://server.com/mcp", { tokens });

      // Verify no .tmp files in listing
      const all = await store.listAll();
      expect(all).toHaveLength(1);
    });
  });

  describe("file permissions", () => {
    it("should create files with restrictive permissions", async () => {
      const serverUrl = "http://localhost:3000/mcp";
      await store.save(serverUrl, {
        tokens: { access_token: "secret", token_type: "bearer" } as OAuthTokens,
      });

      const files = await readdir(tempDir);
      expect(files.length).toBeGreaterThan(0);

      // Verify file content is valid JSON
      const content = await readFile(join(tempDir, files[0]!), "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed.tokens.access_token).toBe("secret");
    });
  });

  describe("getStorePath", () => {
    it("should return the configured store path", () => {
      expect(store.getStorePath()).toBe(tempDir);
    });
  });
});
