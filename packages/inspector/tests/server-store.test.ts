/**
 * Server Store tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ServerStore,
  getConfigDir,
  getServersFilePath,
  type PersistedServerEntry,
  type LocalStorageMigrationPayload,
} from "../src/persistence/server-store";

describe("ServerStore", () => {
  let tempDir: string;
  let store: ServerStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "server-store-test-"));
    store = new ServerStore(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("getConfigDir", () => {
    it("should return a path containing mcp-inspector", () => {
      const path = getConfigDir();
      expect(path).toContain("mcp-inspector");
    });
  });

  describe("getServersFilePath", () => {
    it("should return a path ending with servers.json", () => {
      const path = getServersFilePath();
      expect(path).toMatch(/servers\.json$/);
    });

    it("should use custom config dir when provided", () => {
      const path = getServersFilePath("/custom/path");
      expect(path).toBe("/custom/path/servers.json");
    });
  });

  describe("save and load", () => {
    const testServer: PersistedServerEntry = {
      id: "test-uuid-1234",
      name: "Test Server",
      url: "http://localhost:3000/mcp",
      transport: "http",
      params: { transport: "http", url: "http://localhost:3000/mcp" },
      hasOAuth: false,
      addedAt: Date.now(),
    };

    it("should save and load a server", async () => {
      await store.save(testServer);

      const loaded = await store.load(testServer.id);
      expect(loaded).toBeDefined();
      expect(loaded!.id).toBe(testServer.id);
      expect(loaded!.name).toBe(testServer.name);
      expect(loaded!.url).toBe(testServer.url);
      expect(loaded!.transport).toBe(testServer.transport);
      expect(loaded!.hasOAuth).toBe(testServer.hasOAuth);
      expect(loaded!.addedAt).toBe(testServer.addedAt);
    });

    it("should return undefined for non-existent server", async () => {
      const loaded = await store.load("non-existent-id");
      expect(loaded).toBeUndefined();
    });

    it("should update existing server on save", async () => {
      await store.save(testServer);

      const updated: PersistedServerEntry = {
        ...testServer,
        name: "Updated Server Name",
        hasOAuth: true,
      };
      await store.save(updated);

      const loaded = await store.load(testServer.id);
      expect(loaded!.name).toBe("Updated Server Name");
      expect(loaded!.hasOAuth).toBe(true);
    });

    it("should persist stdio transport params", async () => {
      const stdioServer: PersistedServerEntry = {
        id: "stdio-server-1",
        name: "Stdio Server",
        url: "node",
        transport: "stdio",
        params: {
          transport: "stdio",
          command: "node",
          args: ["server.js"],
          env: { MY_VAR: "value" },
          cwd: "/home/user/project",
        },
        hasOAuth: false,
        addedAt: Date.now(),
      };

      await store.save(stdioServer);
      const loaded = await store.load(stdioServer.id);

      expect(loaded).toBeDefined();
      expect(loaded!.transport).toBe("stdio");
      expect(loaded!.params).toEqual(stdioServer.params);
    });
  });

  describe("delete", () => {
    it("should delete existing server", async () => {
      const server: PersistedServerEntry = {
        id: "to-delete",
        name: "Delete Me",
        url: "http://localhost:3000",
        transport: "http",
        params: { transport: "http", url: "http://localhost:3000" },
        hasOAuth: false,
        addedAt: Date.now(),
      };

      await store.save(server);
      const deleted = await store.delete(server.id);
      expect(deleted).toBe(true);

      const loaded = await store.load(server.id);
      expect(loaded).toBeUndefined();
    });

    it("should return false for non-existent server", async () => {
      const deleted = await store.delete("non-existent");
      expect(deleted).toBe(false);
    });

    it("should not affect other servers", async () => {
      const server1: PersistedServerEntry = {
        id: "server-1",
        name: "Server 1",
        url: "http://localhost:3001",
        transport: "http",
        params: { transport: "http", url: "http://localhost:3001" },
        hasOAuth: false,
        addedAt: Date.now(),
      };
      const server2: PersistedServerEntry = {
        id: "server-2",
        name: "Server 2",
        url: "http://localhost:3002",
        transport: "http",
        params: { transport: "http", url: "http://localhost:3002" },
        hasOAuth: true,
        addedAt: Date.now(),
      };

      await store.save(server1);
      await store.save(server2);
      await store.delete(server1.id);

      const loaded1 = await store.load(server1.id);
      const loaded2 = await store.load(server2.id);

      expect(loaded1).toBeUndefined();
      expect(loaded2).toBeDefined();
      expect(loaded2!.id).toBe(server2.id);
    });
  });

  describe("listAll", () => {
    it("should return empty array when no servers exist", async () => {
      const all = await store.listAll();
      expect(all).toHaveLength(0);
    });

    it("should list all persisted servers", async () => {
      const server1: PersistedServerEntry = {
        id: "server-1",
        name: "Server 1",
        url: "http://localhost:3001",
        transport: "http",
        params: { transport: "http", url: "http://localhost:3001" },
        hasOAuth: false,
        addedAt: 1000,
      };
      const server2: PersistedServerEntry = {
        id: "server-2",
        name: "Server 2",
        url: "http://localhost:3002",
        transport: "http",
        params: { transport: "http", url: "http://localhost:3002" },
        hasOAuth: true,
        addedAt: 2000,
      };

      await store.save(server1);
      await store.save(server2);

      const all = await store.listAll();
      expect(all).toHaveLength(2);
      expect(all.map((s) => s.id).sort()).toEqual(["server-1", "server-2"]);
    });
  });

  describe("migrate", () => {
    it("should import servers from localStorage payload", async () => {
      const payload: LocalStorageMigrationPayload = {
        servers: [
          {
            id: "migrated-1",
            name: "Migrated Server 1",
            url: "http://localhost:4001",
            transport: "http",
            params: { transport: "http", url: "http://localhost:4001" },
            hasOAuth: false,
            addedAt: 1000,
          },
          {
            id: "migrated-2",
            name: "Migrated Server 2",
            url: "http://localhost:4002",
            transport: "http",
            params: { transport: "http", url: "http://localhost:4002" },
            hasOAuth: true,
            addedAt: 2000,
          },
        ],
      };

      const count = await store.migrate(payload);
      expect(count).toBe(2);

      const all = await store.listAll();
      expect(all).toHaveLength(2);
    });

    it("should skip invalid entries", async () => {
      const payload = {
        servers: [
          // Valid
          {
            id: "valid",
            name: "Valid Server",
            url: "http://localhost:3000",
            transport: "http",
            params: { transport: "http", url: "http://localhost:3000" },
            hasOAuth: false,
            addedAt: 1000,
          },
          // Missing id
          {
            name: "Missing ID",
            url: "http://localhost:3001",
            transport: "http",
            params: { transport: "http", url: "http://localhost:3001" },
          },
          // Invalid transport
          {
            id: "invalid-transport",
            name: "Invalid Transport",
            url: "http://localhost:3002",
            transport: "websocket",
            params: { transport: "websocket", url: "http://localhost:3002" },
          },
          // Missing params
          {
            id: "missing-params",
            name: "Missing Params",
            url: "http://localhost:3003",
            transport: "http",
          },
        ],
      } as LocalStorageMigrationPayload;

      const count = await store.migrate(payload);
      expect(count).toBe(1);

      const all = await store.listAll();
      expect(all).toHaveLength(1);
      expect(all[0]!.id).toBe("valid");
    });

    it("should return 0 for empty payload", async () => {
      const count = await store.migrate({ servers: [] });
      expect(count).toBe(0);
    });

    it("should return 0 for invalid payload", async () => {
      const count = await store.migrate({ servers: "not-an-array" } as never);
      expect(count).toBe(0);
    });

    it("should merge with existing servers", async () => {
      // Pre-existing server
      const existing: PersistedServerEntry = {
        id: "existing",
        name: "Existing Server",
        url: "http://localhost:5000",
        transport: "http",
        params: { transport: "http", url: "http://localhost:5000" },
        hasOAuth: false,
        addedAt: 1000,
      };
      await store.save(existing);

      // Migrate new server
      const payload: LocalStorageMigrationPayload = {
        servers: [
          {
            id: "migrated",
            name: "Migrated Server",
            url: "http://localhost:5001",
            transport: "http",
            params: { transport: "http", url: "http://localhost:5001" },
            hasOAuth: true,
            addedAt: 2000,
          },
        ],
      };

      await store.migrate(payload);

      const all = await store.listAll();
      expect(all).toHaveLength(2);
      expect(all.map((s) => s.id).sort()).toEqual(["existing", "migrated"]);
    });

    it("should override existing server with same id", async () => {
      const existing: PersistedServerEntry = {
        id: "same-id",
        name: "Original Name",
        url: "http://localhost:5000",
        transport: "http",
        params: { transport: "http", url: "http://localhost:5000" },
        hasOAuth: false,
        addedAt: 1000,
      };
      await store.save(existing);

      const payload: LocalStorageMigrationPayload = {
        servers: [
          {
            id: "same-id",
            name: "Updated Name",
            url: "http://localhost:5001",
            transport: "http",
            params: { transport: "http", url: "http://localhost:5001" },
            hasOAuth: true,
            addedAt: 2000,
          },
        ],
      };

      await store.migrate(payload);

      const loaded = await store.load("same-id");
      expect(loaded!.name).toBe("Updated Name");
      expect(loaded!.hasOAuth).toBe(true);
    });

    it("should set addedAt to now if not provided", async () => {
      const before = Date.now();

      const payload: LocalStorageMigrationPayload = {
        servers: [
          {
            id: "no-timestamp",
            name: "No Timestamp",
            url: "http://localhost:3000",
            transport: "http",
            params: { transport: "http", url: "http://localhost:3000" },
            hasOAuth: false,
          } as PersistedServerEntry,
        ],
      };

      await store.migrate(payload);

      const after = Date.now();
      const loaded = await store.load("no-timestamp");
      expect(loaded!.addedAt).toBeGreaterThanOrEqual(before);
      expect(loaded!.addedAt).toBeLessThanOrEqual(after);
    });
  });

  describe("isEmpty", () => {
    it("should return true when no servers exist", async () => {
      expect(await store.isEmpty()).toBe(true);
    });

    it("should return false when servers exist", async () => {
      await store.save({
        id: "test",
        name: "Test",
        url: "http://localhost:3000",
        transport: "http",
        params: { transport: "http", url: "http://localhost:3000" },
        hasOAuth: false,
        addedAt: Date.now(),
      });

      expect(await store.isEmpty()).toBe(false);
    });
  });

  describe("clear", () => {
    it("should remove all servers", async () => {
      await store.save({
        id: "server-1",
        name: "Server 1",
        url: "http://localhost:3001",
        transport: "http",
        params: { transport: "http", url: "http://localhost:3001" },
        hasOAuth: false,
        addedAt: Date.now(),
      });
      await store.save({
        id: "server-2",
        name: "Server 2",
        url: "http://localhost:3002",
        transport: "http",
        params: { transport: "http", url: "http://localhost:3002" },
        hasOAuth: true,
        addedAt: Date.now(),
      });

      await store.clear();

      expect(await store.isEmpty()).toBe(true);
    });
  });

  describe("exists", () => {
    it("should return false when file does not exist", async () => {
      expect(await store.exists()).toBe(false);
    });

    it("should return true after save", async () => {
      await store.save({
        id: "test",
        name: "Test",
        url: "http://localhost:3000",
        transport: "http",
        params: { transport: "http", url: "http://localhost:3000" },
        hasOAuth: false,
        addedAt: Date.now(),
      });

      expect(await store.exists()).toBe(true);
    });
  });

  describe("getters", () => {
    it("should return the configured config dir", () => {
      expect(store.getConfigDir()).toBe(tempDir);
    });

    it("should return the file path", () => {
      expect(store.getFilePath()).toBe(join(tempDir, "servers.json"));
    });
  });

  describe("file permissions", () => {
    it("should create files with restrictive permissions", async () => {
      await store.save({
        id: "secret-server",
        name: "Secret Server",
        url: "http://localhost:3000",
        transport: "http",
        params: { transport: "http", url: "http://localhost:3000" },
        hasOAuth: true,
        addedAt: Date.now(),
      });

      // Verify file content is valid JSON
      const filePath = store.getFilePath();
      const content = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(content);

      expect(parsed.version).toBe(1);
      expect(parsed.servers["secret-server"]).toBeDefined();
      expect(parsed.servers["secret-server"].name).toBe("Secret Server");

      // Verify file permissions (Unix only)
      if (process.platform !== "win32") {
        const fileStat = await stat(filePath);
        const mode = fileStat.mode & 0o777;
        expect(mode).toBe(0o600);
      }
    });

    it("should create directory with 0o700 permissions", async () => {
      await store.save({
        id: "test",
        name: "Test",
        url: "http://localhost:3000",
        transport: "http",
        params: { transport: "http", url: "http://localhost:3000" },
        hasOAuth: false,
        addedAt: Date.now(),
      });

      // Verify directory permissions (Unix only)
      if (process.platform !== "win32") {
        const dirStat = await stat(tempDir);
        const mode = dirStat.mode & 0o777;
        expect(mode).toBe(0o700);
      }
    });
  });

  describe("atomic writes", () => {
    it("should not leave temp files on success", async () => {
      await store.save({
        id: "test",
        name: "Test",
        url: "http://localhost:3000",
        transport: "http",
        params: { transport: "http", url: "http://localhost:3000" },
        hasOAuth: false,
        addedAt: Date.now(),
      });

      const { readdir } = await import("node:fs/promises");
      const files = await readdir(tempDir);

      // Should only have servers.json, no .tmp files
      expect(files).toHaveLength(1);
      expect(files[0]).toBe("servers.json");
    });
  });

  describe("corruption handling", () => {
    it("should return empty data for corrupted JSON", async () => {
      const { writeFile: fsWriteFile } = await import("node:fs/promises");
      const filePath = store.getFilePath();

      await store.save({
        id: "test",
        name: "Test",
        url: "http://localhost:3000",
        transport: "http",
        params: { transport: "http", url: "http://localhost:3000" },
        hasOAuth: false,
        addedAt: Date.now(),
      });

      // Corrupt the file
      await fsWriteFile(filePath, "{ invalid json", "utf-8");

      // Should return empty list, not throw
      const all = await store.listAll();
      expect(all).toHaveLength(0);
    });

    it("should return empty data for invalid structure", async () => {
      const { writeFile: fsWriteFile } = await import("node:fs/promises");
      const filePath = store.getFilePath();

      await store.save({
        id: "test",
        name: "Test",
        url: "http://localhost:3000",
        transport: "http",
        params: { transport: "http", url: "http://localhost:3000" },
        hasOAuth: false,
        addedAt: Date.now(),
      });

      // Write valid JSON with wrong structure
      await fsWriteFile(filePath, '{"wrong": "structure"}', "utf-8");

      // Should return empty list, not throw
      const all = await store.listAll();
      expect(all).toHaveLength(0);
    });

    it("should return empty data for wrong version", async () => {
      const { writeFile: fsWriteFile } = await import("node:fs/promises");
      const filePath = store.getFilePath();

      await store.save({
        id: "test",
        name: "Test",
        url: "http://localhost:3000",
        transport: "http",
        params: { transport: "http", url: "http://localhost:3000" },
        hasOAuth: false,
        addedAt: Date.now(),
      });

      // Write valid structure with different version
      await fsWriteFile(filePath, '{"version": 99, "servers": {}}', "utf-8");

      // Should return empty list (version mismatch)
      const all = await store.listAll();
      expect(all).toHaveLength(0);
    });
  });
});
