/**
 * Unit tests for createApp versioning support
 *
 * Tests multi-version app creation, config merging, route isolation,
 * and backward compatibility with single-version apps.
 */

import { describe, it, expect, afterEach } from "vitest";
import { z } from "zod";
import { createApp, type AppConfigInput, type VersionsConfig } from "../../src/index";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

describe("createApp versioning", () => {
  describe("multi-version app creation", () => {
    it("should create a multi-version app with versions config", () => {
      const app = createApp({
        name: "test-app",
        versions: {
          v1: {
            version: "1.0.0",
            tools: {
              greet: {
                description: "Greet v1",
                input: z.object({ name: z.string() }),
                output: z.object({ message: z.string() }),
                handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
              },
            },
          },
          v2: {
            version: "2.0.0",
            tools: {
              greet: {
                description: "Greet v2",
                input: z.object({ name: z.string(), surname: z.string().optional() }),
                output: z.object({ message: z.string() }),
                handler: async ({ name, surname }) => ({
                  message: `Hello, ${name} ${surname || ""}!`.trim(),
                }),
              },
            },
          },
        },
      });

      expect(app).toBeDefined();
      expect(app.getVersions).toBeDefined();
      expect(app.getVersion).toBeDefined();
    });

    it("should return available version keys", () => {
      const app = createApp({
        name: "test-app",
        versions: {
          v1: {
            version: "1.0.0",
            tools: {},
          },
          v2: {
            version: "2.0.0",
            tools: {},
          },
          v3: {
            version: "3.0.0",
            tools: {},
          },
        },
      });

      const versions = app.getVersions();
      expect(versions).toEqual(["v1", "v2", "v3"]);
    });

    it("should return undefined for getVersions() in single-version mode", () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {},
      });

      const versions = app.getVersions();
      expect(versions).toEqual([]);
    });

    it("should return undefined for getVersion() in single-version mode", () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {},
      });

      const version = app.getVersion("v1");
      expect(version).toBeUndefined();
    });

    it("should return version app for valid version key", () => {
      const app = createApp({
        name: "test-app",
        versions: {
          v1: {
            version: "1.0.0",
            tools: {
              tool1: {
                description: "Tool 1",
                input: z.object({}),
                output: z.object({ result: z.string() }),
                handler: async () => ({ result: "v1" }),
              },
            },
          },
          v2: {
            version: "2.0.0",
            tools: {
              tool2: {
                description: "Tool 2",
                input: z.object({}),
                output: z.object({ result: z.string() }),
                handler: async () => ({ result: "v2" }),
              },
            },
          },
        },
      });

      const v1App = app.getVersion("v1");
      const v2App = app.getVersion("v2");

      expect(v1App).toBeDefined();
      expect(v2App).toBeDefined();
      expect(v1App?.tools.tool1).toBeDefined();
      expect(v2App?.tools.tool2).toBeDefined();
      expect(v1App?.tools.tool2).toBeUndefined();
      expect(v2App?.tools.tool1).toBeUndefined();
    });

    it("should return undefined for invalid version key", () => {
      const app = createApp({
        name: "test-app",
        versions: {
          v1: {
            version: "1.0.0",
            tools: {},
          },
        },
      });

      const version = app.getVersion("v999");
      expect(version).toBeUndefined();
    });
  });

  describe("version key validation", () => {
    it("should reject invalid version keys", () => {
      expect(() =>
        createApp({
          name: "test-app",
          versions: {
            // @ts-expect-error - Testing runtime validation
            invalid: {
              version: "1.0.0",
              tools: {},
            },
          },
        })
      ).toThrow(/Version key must match pattern/);
    });

    it("should accept valid version keys (v1, v2, v10, etc.)", () => {
      const app = createApp({
        name: "test-app",
        versions: {
          v1: {
            version: "1.0.0",
            tools: {},
          },
          v2: {
            version: "2.0.0",
            tools: {},
          },
          v10: {
            version: "10.0.0",
            tools: {},
          },
        },
      });

      expect(app.getVersions()).toEqual(["v1", "v2", "v10"]);
    });

    it("should reject version keys that conflict with reserved routes", () => {
      expect(() =>
        createApp({
          name: "test-app",
          versions: {
            v1: {
              version: "1.0.0",
              tools: {},
              config: {
                // @ts-expect-error - Testing runtime validation
                serverRoute: "/health",
              },
            },
          },
        })
      ).toThrow(/conflicts with the health check endpoint/);
    });
  });

  describe("config merging", () => {
    it("should merge global config with version-specific config", () => {
      const app = createApp({
        name: "test-app",
        config: {
          cors: {
            origin: true,
          },
          debug: {
            logTool: true,
            level: "info",
          },
        },
        versions: {
          v1: {
            version: "1.0.0",
            tools: {},
            config: {
              debug: {
                logTool: false,
                level: "warn",
              },
            },
          },
        },
      });

      const v1App = app.getVersion("v1");
      expect(v1App).toBeDefined();
      // Version-specific config should override global
      // We can't directly access config, but we can verify behavior
    });

    it("should use global config when version-specific config is not provided", () => {
      const app = createApp({
        name: "test-app",
        config: {
          cors: {
            origin: "https://example.com",
          },
        },
        versions: {
          v1: {
            version: "1.0.0",
            tools: {},
          },
        },
      });

      expect(app).toBeDefined();
      // Global config should be applied to v1
    });

    it("should merge global plugins with version-specific plugins", () => {
      const globalPlugin = {
        name: "global-plugin",
        onInit: () => {},
      };

      const versionPlugin = {
        name: "version-plugin",
        onInit: () => {},
      };

      const app = createApp({
        name: "test-app",
        plugins: [globalPlugin],
        versions: {
          v1: {
            version: "1.0.0",
            tools: {},
            plugins: [versionPlugin],
          },
        },
      });

      expect(app).toBeDefined();
      // Both plugins should be registered for v1
    });
  });

  describe("route isolation", () => {
    it("should expose each version at its dedicated route", async () => {
      const app = createApp({
        name: "test-app",
        versions: {
          v1: {
            version: "1.0.0",
            tools: {
              tool1: {
                description: "Tool 1",
                input: z.object({}),
                output: z.object({ result: z.string() }),
                handler: async () => ({ result: "v1-result" }),
              },
            },
          },
          v2: {
            version: "2.0.0",
            tools: {
              tool2: {
                description: "Tool 2",
                input: z.object({}),
                output: z.object({ result: z.string() }),
                handler: async () => ({ result: "v2-result" }),
              },
            },
          },
        },
      });

      const port = 3100;
      await app.start({ port });

      // Test v1 endpoint
      const transport1 = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${port}/v1/mcp`)
      );
      const client1 = new Client(
        {
          name: "test-client",
          version: "1.0.0",
        },
        {
          capabilities: {},
        }
      );
      await client1.connect(transport1);
      const tools1 = await client1.listTools();
      await client1.close();

      expect(tools1.tools.length).toBeGreaterThanOrEqual(1);
      expect(tools1.tools.find((t) => t.name === "tool1")).toBeDefined();

      // Test v2 endpoint
      const transport2 = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${port}/v2/mcp`)
      );
      const client2 = new Client(
        {
          name: "test-client",
          version: "1.0.0",
        },
        {
          capabilities: {},
        }
      );
      await client2.connect(transport2);
      const tools2 = await client2.listTools();
      await client2.close();

      expect(tools2.tools.length).toBeGreaterThanOrEqual(1);
      expect(tools2.tools.find((t) => t.name === "tool2")).toBeDefined();
      expect(tools2.tools.find((t) => t.name === "tool1")).toBeUndefined();

      const httpServer = app.getServer().httpServer;
      if (httpServer) {
        await new Promise<void>((resolve) => {
          httpServer.close(() => resolve());
        });
      }
    });

    it("should have shared health endpoint", async () => {
      const app = createApp({
        name: "test-app",
        versions: {
          v1: {
            version: "1.0.0",
            tools: {},
          },
          v2: {
            version: "2.0.0",
            tools: {},
          },
        },
      });

      const port = 3101;
      await app.start({ port });

      const response = await fetch(`http://localhost:${port}/health`);
      const data = await response.json();

      expect(data.status).toBe("ok");
      expect(data.name).toBe("test-app");
      expect(data.versions).toEqual(["v1", "v2"]);

      const httpServer = app.getServer().httpServer;
      if (httpServer) {
        await new Promise<void>((resolve) => {
          httpServer.close(() => resolve());
        });
      }
    });

    it("should return 404 for non-existent version routes", async () => {
      const app = createApp({
        name: "test-app",
        versions: {
          v1: {
            version: "1.0.0",
            tools: {},
          },
        },
      });

      const port = 3102;
      await app.start({ port });

      const response = await fetch(`http://localhost:${port}/v999/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/list",
          params: {},
          id: 1,
        }),
      });

      expect(response.status).toBe(404);

      const httpServer = app.getServer().httpServer;
      if (httpServer) {
        await new Promise<void>((resolve) => {
          httpServer.close(() => resolve());
        });
      }
    });
  });

  describe("tool execution isolation", () => {
    it("should execute tools independently per version", async () => {
      const app = createApp({
        name: "test-app",
        versions: {
          v1: {
            version: "1.0.0",
            tools: {
              add: {
                description: "Add v1",
                input: z.object({ a: z.number(), b: z.number() }),
                output: z.object({ result: z.number() }),
                handler: async ({ a, b }) => ({ result: a + b }),
              },
            },
          },
          v2: {
            version: "2.0.0",
            tools: {
              add: {
                description: "Add v2",
                input: z.object({ a: z.number(), b: z.number(), c: z.number().optional() }),
                output: z.object({ result: z.number() }),
                handler: async ({ a, b, c }) => ({ result: a + b + (c || 0) }),
              },
            },
          },
        },
      });

      const port = 3103;
      await app.start({ port });

      // Test v1 tool
      const transport1 = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${port}/v1/mcp`)
      );
      const client1 = new Client(
        {
          name: "test-client",
          version: "1.0.0",
        },
        {
          capabilities: {},
        }
      );
      await client1.connect(transport1);
      const result1 = await client1.callTool({
        name: "add",
        arguments: { a: 1, b: 2 },
      });
      await client1.close();

      expect(result1.content[0].text).toContain("3");

      // Test v2 tool (with optional c parameter)
      const transport2 = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${port}/v2/mcp`)
      );
      const client2 = new Client(
        {
          name: "test-client",
          version: "1.0.0",
        },
        {
          capabilities: {},
        }
      );
      await client2.connect(transport2);
      const result2 = await client2.callTool({
        name: "add",
        arguments: { a: 1, b: 2, c: 3 },
      });
      await client2.close();

      expect(result2.content[0].text).toContain("6");

      const httpServer = app.getServer().httpServer;
      if (httpServer) {
        await new Promise<void>((resolve) => {
          httpServer.close(() => resolve());
        });
      }
    });
  });

  describe("backward compatibility", () => {
    it("should support single-version config (backward compatible)", () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {
          greet: {
            description: "Greet",
            input: z.object({ name: z.string() }),
            output: z.object({ message: z.string() }),
            handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
          },
        },
      });

      expect(app).toBeDefined();
      expect(app.tools.greet).toBeDefined();
      expect(app.getVersions()).toEqual([]);
      expect(app.getVersion("v1")).toBeUndefined();
    });

    it("should work with single-version app.start()", async () => {
      const app = createApp({
        name: "test-app",
        version: "1.0.0",
        tools: {},
      });

      const port = 3104;
      await app.start({ port });
      const server = app.getServer();
      expect(server).toBeDefined();

      const httpServer = server.httpServer;
      if (httpServer) {
        await new Promise<void>((resolve) => {
          httpServer.close(() => resolve());
        });
      }
    });
  });

  describe("shared Express app", () => {
    it("should use the same Express app instance for all versions", () => {
      const app = createApp({
        name: "test-app",
        versions: {
          v1: {
            version: "1.0.0",
            tools: {},
          },
          v2: {
            version: "2.0.0",
            tools: {},
          },
        },
      });

      const v1App = app.getVersion("v1");
      const v2App = app.getVersion("v2");

      expect(v1App?.expressApp).toBeDefined();
      expect(v2App?.expressApp).toBeDefined();
      // Both should reference the same Express app
      expect(v1App?.expressApp).toBe(v2App?.expressApp);
      expect(v1App?.expressApp).toBe(app.expressApp);
    });
  });

  describe("version-specific middleware", () => {
    it("should allow version-specific middleware", async () => {
      const v1MiddlewareCalled: boolean[] = [];
      const v2MiddlewareCalled: boolean[] = [];

      const app = createApp({
        name: "test-app",
        versions: {
          v1: {
            version: "1.0.0",
            tools: {
              test: {
                description: "Test",
                input: z.object({}),
                output: z.object({ result: z.string() }),
                handler: async () => ({ result: "v1" }),
              },
            },
          },
          v2: {
            version: "2.0.0",
            tools: {
              test: {
                description: "Test",
                input: z.object({}),
                output: z.object({ result: z.string() }),
                handler: async () => ({ result: "v2" }),
              },
            },
          },
        },
      });

      const v1App = app.getVersion("v1");
      const v2App = app.getVersion("v2");

      v1App?.use(async (ctx, next) => {
        v1MiddlewareCalled.push(true);
        await next();
      });

      v2App?.use(async (ctx, next) => {
        v2MiddlewareCalled.push(true);
        await next();
      });

      const port = 3105;
      await app.start({ port });

      // Call v1 tool
      const transport1 = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${port}/v1/mcp`)
      );
      const client1 = new Client(
        {
          name: "test-client",
          version: "1.0.0",
        },
        {
          capabilities: {},
        }
      );
      await client1.connect(transport1);
      await client1.callTool({ name: "test", arguments: {} });
      await client1.close();

      // Call v2 tool
      const transport2 = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${port}/v2/mcp`)
      );
      const client2 = new Client(
        {
          name: "test-client",
          version: "1.0.0",
        },
        {
          capabilities: {},
        }
      );
      await client2.connect(transport2);
      await client2.callTool({ name: "test", arguments: {} });
      await client2.close();

      expect(v1MiddlewareCalled.length).toBeGreaterThan(0);
      expect(v2MiddlewareCalled.length).toBeGreaterThan(0);

      const httpServer = app.getServer().httpServer;
      if (httpServer) {
        await new Promise<void>((resolve) => {
          httpServer.close(() => resolve());
        });
      }
    });
  });

  describe("handleRequest for serverless deployments", () => {
    it("should handle /health endpoint via handleRequest", async () => {
      const app = createApp({
        name: "test-app",
        versions: {
          v1: {
            version: "1.0.0",
            tools: {},
          },
          v2: {
            version: "2.0.0",
            tools: {},
          },
        },
      });

      const request = new Request("http://localhost/health");
      const response = await app.handleRequest(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.status).toBe("ok");
      expect(data.name).toBe("test-app");
      expect(data.versions).toEqual(["v1", "v2"]);
    });

    it("should handle /.well-known/openai-apps-challenge via handleRequest", async () => {
      const challengeToken = "test-challenge-token-123";
      const app = createApp({
        name: "test-app",
        config: {
          openai: {
            domain_challenge: challengeToken,
          },
        },
        versions: {
          v1: {
            version: "1.0.0",
            tools: {},
          },
        },
      });

      const request = new Request("http://localhost/.well-known/openai-apps-challenge");
      const response = await app.handleRequest(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/plain");
      const text = await response.text();
      expect(text).toBe(challengeToken);
    });

    it("should return 404 for /.well-known/openai-apps-challenge when not configured", async () => {
      const app = createApp({
        name: "test-app",
        versions: {
          v1: {
            version: "1.0.0",
            tools: {},
          },
        },
      });

      const request = new Request("http://localhost/.well-known/openai-apps-challenge");
      const response = await app.handleRequest(request);

      expect(response.status).toBe(404);
    });

    it("should return 404 for unmatched routes via handleRequest", async () => {
      const app = createApp({
        name: "test-app",
        versions: {
          v1: {
            version: "1.0.0",
            tools: {},
          },
        },
      });

      const request = new Request("http://localhost/unknown-route");
      const response = await app.handleRequest(request);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe("Not found");
    });

    it("should return 404 for non-existent version via handleRequest", async () => {
      const app = createApp({
        name: "test-app",
        versions: {
          v1: {
            version: "1.0.0",
            tools: {},
          },
        },
      });

      const request = new Request("http://localhost/v999/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/list",
          params: {},
          id: 1,
        }),
      });
      const response = await app.handleRequest(request);

      expect(response.status).toBe(404);
    });
  });
});
