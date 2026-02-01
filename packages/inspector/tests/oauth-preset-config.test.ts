/**
 * OAuth Preset Config tests
 *
 * Tests for CLI flag parsing, config file loading, preset provider creation,
 * and token checking.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  hasPresetFlags,
  parsePresetFlags,
  loadPresetConfigFile,
  resolvePresetConfig,
  createPresetProvider,
  checkExistingTokens,
  type PresetCLIFlags,
} from "../src/oauth/preset-config";
import { TokenStore } from "../src/oauth/token-store";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

describe("OAuth Preset Config", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "oauth-preset-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // ===========================================================================
  // hasPresetFlags
  // ===========================================================================

  describe("hasPresetFlags", () => {
    it("should return false when no flags are set", () => {
      expect(hasPresetFlags({})).toBe(false);
    });

    it("should return true when oauthClientId is set", () => {
      expect(hasPresetFlags({ oauthClientId: "my-id" })).toBe(true);
    });

    it("should return true when oauthClientSecret is set", () => {
      expect(hasPresetFlags({ oauthClientSecret: "secret" })).toBe(true);
    });

    it("should return true when oauthScopes is set", () => {
      expect(hasPresetFlags({ oauthScopes: "read,write" })).toBe(true);
    });

    it("should return true when oauthConfig is set", () => {
      expect(hasPresetFlags({ oauthConfig: "/path/to/config.json" })).toBe(true);
    });

    it("should return true when oauthAutoRegister is set", () => {
      expect(hasPresetFlags({ oauthAutoRegister: true })).toBe(true);
    });

    it("should return false when oauthAutoRegister is false", () => {
      expect(hasPresetFlags({ oauthAutoRegister: false })).toBe(false);
    });
  });

  // ===========================================================================
  // parsePresetFlags
  // ===========================================================================

  describe("parsePresetFlags", () => {
    it("should parse clientId flag", () => {
      const config = parsePresetFlags({ oauthClientId: "my-client" });
      expect(config.clientId).toBe("my-client");
    });

    it("should parse clientSecret flag", () => {
      const config = parsePresetFlags({
        oauthClientId: "my-client",
        oauthClientSecret: "my-secret",
      });
      expect(config.clientSecret).toBe("my-secret");
    });

    it("should parse comma-separated scopes to space-separated", () => {
      const config = parsePresetFlags({
        oauthClientId: "my-client",
        oauthScopes: "read,write,admin",
      });
      expect(config.scopes).toBe("read write admin");
    });

    it("should preserve space-separated scopes", () => {
      const config = parsePresetFlags({
        oauthClientId: "my-client",
        oauthScopes: "read write admin",
      });
      expect(config.scopes).toBe("read write admin");
    });

    it("should trim whitespace from scopes", () => {
      const config = parsePresetFlags({
        oauthClientId: "my-client",
        oauthScopes: " read , write ",
      });
      expect(config.scopes).toBe("read   write");
    });

    it("should enable dynamic registration", () => {
      const config = parsePresetFlags({ oauthAutoRegister: true });
      expect(config.enableDynamicRegistration).toBe(true);
    });

    it("should throw when neither clientId nor autoRegister is provided", () => {
      expect(() => parsePresetFlags({ oauthScopes: "read" })).toThrow(
        "OAuth preset requires --oauth-client-id or --oauth-auto-register"
      );
    });

    it("should throw when only clientSecret is provided", () => {
      expect(() => parsePresetFlags({ oauthClientSecret: "secret" })).toThrow(
        "OAuth preset requires --oauth-client-id or --oauth-auto-register"
      );
    });

    it("should set empty redirectUri (filled by provider later)", () => {
      const config = parsePresetFlags({ oauthClientId: "my-client" });
      expect(config.redirectUri).toBe("");
    });
  });

  // ===========================================================================
  // loadPresetConfigFile
  // ===========================================================================

  describe("loadPresetConfigFile", () => {
    it("should load a valid config file with clientId", async () => {
      const filePath = join(tempDir, "oauth.json");
      await writeFile(
        filePath,
        JSON.stringify({
          clientId: "file-client",
          clientSecret: "file-secret",
          scopes: "read,write",
        })
      );

      const config = await loadPresetConfigFile(filePath);
      expect(config.clientId).toBe("file-client");
      expect(config.clientSecret).toBe("file-secret");
      expect(config.scopes).toBe("read write");
    });

    it("should load a config file with autoRegister", async () => {
      const filePath = join(tempDir, "oauth.json");
      await writeFile(filePath, JSON.stringify({ autoRegister: true }));

      const config = await loadPresetConfigFile(filePath);
      expect(config.enableDynamicRegistration).toBe(true);
    });

    it("should load clientName from config file", async () => {
      const filePath = join(tempDir, "oauth.json");
      await writeFile(
        filePath,
        JSON.stringify({
          clientId: "my-client",
          clientName: "My Custom App",
        })
      );

      const config = await loadPresetConfigFile(filePath);
      expect(config.clientName).toBe("My Custom App");
    });

    it("should throw for non-existent file", async () => {
      await expect(loadPresetConfigFile("/nonexistent/path.json")).rejects.toThrow(
        "Failed to read OAuth config file"
      );
    });

    it("should throw for invalid JSON", async () => {
      const filePath = join(tempDir, "bad.json");
      await writeFile(filePath, "not json {{{");

      await expect(loadPresetConfigFile(filePath)).rejects.toThrow(
        "OAuth config file is not valid JSON"
      );
    });

    it("should throw for JSON array", async () => {
      const filePath = join(tempDir, "array.json");
      await writeFile(filePath, "[]");

      await expect(loadPresetConfigFile(filePath)).rejects.toThrow(
        "OAuth config file must contain a JSON object"
      );
    });

    it("should throw when neither clientId nor autoRegister is present", async () => {
      const filePath = join(tempDir, "empty.json");
      await writeFile(filePath, JSON.stringify({ scopes: "read" }));

      await expect(loadPresetConfigFile(filePath)).rejects.toThrow(
        'must include "clientId" or "autoRegister"'
      );
    });

    it("should throw for non-string clientId", async () => {
      const filePath = join(tempDir, "bad-type.json");
      await writeFile(filePath, JSON.stringify({ clientId: 123 }));

      await expect(loadPresetConfigFile(filePath)).rejects.toThrow('"clientId" must be a string');
    });

    it("should throw for non-string clientSecret", async () => {
      const filePath = join(tempDir, "bad-secret.json");
      await writeFile(filePath, JSON.stringify({ clientId: "ok", clientSecret: true }));

      await expect(loadPresetConfigFile(filePath)).rejects.toThrow(
        '"clientSecret" must be a string'
      );
    });

    it("should throw for non-string scopes", async () => {
      const filePath = join(tempDir, "bad-scopes.json");
      await writeFile(filePath, JSON.stringify({ clientId: "ok", scopes: ["read"] }));

      await expect(loadPresetConfigFile(filePath)).rejects.toThrow('"scopes" must be a string');
    });

    it("should throw for non-string clientName", async () => {
      const filePath = join(tempDir, "bad-name.json");
      await writeFile(filePath, JSON.stringify({ clientId: "ok", clientName: 42 }));

      await expect(loadPresetConfigFile(filePath)).rejects.toThrow('"clientName" must be a string');
    });
  });

  // ===========================================================================
  // resolvePresetConfig
  // ===========================================================================

  describe("resolvePresetConfig", () => {
    it("should return parsed flags when no config file", async () => {
      const config = await resolvePresetConfig({ oauthClientId: "flag-client" });
      expect(config.clientId).toBe("flag-client");
    });

    it("should return file config when only oauthConfig is provided", async () => {
      const filePath = join(tempDir, "oauth.json");
      await writeFile(
        filePath,
        JSON.stringify({
          clientId: "file-client",
          clientSecret: "file-secret",
        })
      );

      const config = await resolvePresetConfig({ oauthConfig: filePath });
      expect(config.clientId).toBe("file-client");
      expect(config.clientSecret).toBe("file-secret");
    });

    it("should merge CLI flags over file config", async () => {
      const filePath = join(tempDir, "oauth.json");
      await writeFile(
        filePath,
        JSON.stringify({
          clientId: "file-client",
          clientSecret: "file-secret",
          scopes: "file-scope",
          clientName: "File App",
        })
      );

      const config = await resolvePresetConfig({
        oauthConfig: filePath,
        oauthClientId: "cli-client",
        oauthScopes: "cli-scope",
      });

      // CLI flags override
      expect(config.clientId).toBe("cli-client");
      expect(config.scopes).toBe("cli-scope");
      // File values preserved when not overridden
      expect(config.clientSecret).toBe("file-secret");
      expect(config.clientName).toBe("File App");
    });

    it("should propagate file load errors", async () => {
      await expect(resolvePresetConfig({ oauthConfig: "/nonexistent/path.json" })).rejects.toThrow(
        "Failed to read OAuth config file"
      );
    });
  });

  // ===========================================================================
  // createPresetProvider
  // ===========================================================================

  describe("createPresetProvider", () => {
    it("should create a provider with correct server URL", () => {
      const provider = createPresetProvider({
        serverUrl: "http://localhost:3000/mcp",
        config: { clientId: "test", redirectUri: "" },
        callbackPort: 6274,
      });

      expect(provider.getServerUrl()).toBe("http://localhost:3000/mcp");
    });

    it("should construct redirect URI from callback port", () => {
      const provider = createPresetProvider({
        serverUrl: "http://localhost:3000/mcp",
        config: { clientId: "test", redirectUri: "" },
        callbackPort: 8080,
      });

      expect(provider.redirectUrl.toString()).toBe("http://127.0.0.1:8080/oauth/callback");
    });

    it("should return client information from config", async () => {
      const provider = createPresetProvider({
        serverUrl: "http://localhost:3000/mcp",
        config: { clientId: "preset-client", clientSecret: "preset-secret", redirectUri: "" },
        callbackPort: 6274,
      });

      const info = await provider.clientInformation();
      expect(info?.client_id).toBe("preset-client");
      expect(info?.client_secret).toBe("preset-secret");
    });

    it("should throw on redirectToAuthorization (non-interactive)", async () => {
      const provider = createPresetProvider({
        serverUrl: "http://localhost:3000/mcp",
        config: { clientId: "test", redirectUri: "" },
        callbackPort: 6274,
      });

      const authUrl = new URL("https://auth.example.com/authorize?client_id=test");
      await expect(provider.redirectToAuthorization(authUrl)).rejects.toThrow(
        "no browser available in preset/CLI mode"
      );
    });

    it("should include the authorization URL in the error message", async () => {
      const provider = createPresetProvider({
        serverUrl: "http://localhost:3000/mcp",
        config: { clientId: "test", redirectUri: "" },
        callbackPort: 6274,
      });

      const authUrl = new URL("https://auth.example.com/authorize?client_id=test");
      await expect(provider.redirectToAuthorization(authUrl)).rejects.toThrow(
        "https://auth.example.com/authorize?client_id=test"
      );
    });

    it("should still set pending auth URL before throwing", async () => {
      const provider = createPresetProvider({
        serverUrl: "http://localhost:3000/mcp",
        config: { clientId: "test", redirectUri: "" },
        callbackPort: 6274,
      });

      const authUrl = new URL("https://auth.example.com/authorize");

      // redirectToAuthorization stores the URL then throws
      try {
        await provider.redirectToAuthorization(authUrl);
      } catch {
        // Expected
      }

      // The URL was stored before the throw
      expect(provider.getPendingAuthUrl()).toEqual(authUrl);
    });

    it("should use custom token store when provided", async () => {
      const tokenStore = new TokenStore(tempDir);
      const serverUrl = "http://localhost:3000/mcp";

      // Pre-populate tokens
      await tokenStore.saveTokens(serverUrl, {
        access_token: "preset-token",
        token_type: "bearer",
      } as OAuthTokens);

      const provider = createPresetProvider({
        serverUrl,
        config: { clientId: "test", redirectUri: "" },
        callbackPort: 6274,
        tokenStore,
      });

      const tokens = await provider.tokens();
      expect(tokens?.access_token).toBe("preset-token");
    });
  });

  // ===========================================================================
  // checkExistingTokens
  // ===========================================================================

  describe("checkExistingTokens", () => {
    it("should return false when no tokens exist", async () => {
      const tokenStore = new TokenStore(tempDir);
      const result = await checkExistingTokens("http://unknown-server.com", tokenStore);
      expect(result.hasTokens).toBe(false);
      expect(result.hasRefreshToken).toBe(false);
    });

    it("should detect existing access token", async () => {
      const tokenStore = new TokenStore(tempDir);
      const serverUrl = "http://localhost:3000/mcp";

      await tokenStore.saveTokens(serverUrl, {
        access_token: "existing-token",
        token_type: "bearer",
      } as OAuthTokens);

      const result = await checkExistingTokens(serverUrl, tokenStore);
      expect(result.hasTokens).toBe(true);
      expect(result.hasRefreshToken).toBe(false);
    });

    it("should detect existing refresh token", async () => {
      const tokenStore = new TokenStore(tempDir);
      const serverUrl = "http://localhost:3000/mcp";

      await tokenStore.saveTokens(serverUrl, {
        access_token: "existing-token",
        token_type: "bearer",
        refresh_token: "existing-refresh",
      } as OAuthTokens);

      const result = await checkExistingTokens(serverUrl, tokenStore);
      expect(result.hasTokens).toBe(true);
      expect(result.hasRefreshToken).toBe(true);
    });
  });
});
