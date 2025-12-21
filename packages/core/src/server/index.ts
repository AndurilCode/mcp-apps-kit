/**
 * Server module for @apps-builder/core
 *
 * Provides MCP server implementation with Streamable HTTP and stdio transports.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express, { type Express, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "http";
import type { z } from "zod";

import type { ToolDefs, StartOptions, ExpressMiddleware } from "../types/tools";
import type { AppConfig, CORSConfig } from "../types/config";
import type { UIDefs, UIDef } from "../types/ui";
import { zodToJsonSchema } from "../utils/schema";
import { wrapError } from "../utils/errors";
import { mapVisibilityToMcp } from "../utils/metadata";
import { generateMcpCSPMetadata } from "../utils/csp";
import * as fs from "node:fs";
import * as path from "node:path";

// =============================================================================
// SERVER WRAPPER
// =============================================================================

export interface ServerInstance {
  /** Underlying MCP server */
  mcpServer: McpServer;
  /** Express app instance */
  expressApp: Express;
  /** HTTP server (when running) */
  httpServer?: Server;
  /** Start the server */
  start: (options?: StartOptions) => Promise<void>;
  /** Stop the server */
  stop: () => Promise<void>;
  /** Get Express middleware */
  handler: () => ExpressMiddleware;
  /** Handle a single request (for serverless) */
  handleRequest: (req: globalThis.Request, env?: unknown) => Promise<globalThis.Response>;
}

/**
 * Create an MCP server instance with tools registered
 */
export function createServerInstance<T extends ToolDefs>(
  config: AppConfig<T>
): ServerInstance {
  // Create MCP server
  const mcpServer = new McpServer({
    name: config.name,
    version: config.version,
  });

  // Register tools with MCP server
  registerTools(mcpServer, config.tools);

  // Register UI resources with MCP server
  if (config.ui) {
    registerUIResources(mcpServer, config.name, config.ui);
  }

  // Create Express app
  const expressApp = express();
  expressApp.use(express.json());

  // Apply CORS if configured
  if (config.config?.cors) {
    applyCors(expressApp, config.config.cors);
  }

  // Track HTTP server
  let httpServer: Server | undefined;

  // Session management for Streamable HTTP transport
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  // Setup Streamable HTTP endpoint for MCP
  expressApp.post("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      // Reuse existing session
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New session initialization
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports[id] = transport;
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete transports[sid];
        }
      };

      // Connect the new transport to the MCP server
      await mcpServer.connect(transport);
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Invalid session" },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  });

  // GET endpoint for SSE streaming (Streamable HTTP)
  expressApp.get("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string;
    const transport = transports[sessionId];
    if (transport) {
      await transport.handleRequest(req, res);
    } else {
      res.status(400).json({ error: "Invalid session" });
    }
  });

  // DELETE endpoint for session cleanup
  expressApp.delete("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string;
    const transport = transports[sessionId];
    if (transport) {
      await transport.handleRequest(req, res);
    } else {
      res.status(400).json({ error: "Invalid session" });
    }
  });

  // Health check endpoint
  expressApp.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", name: config.name, version: config.version });
  });

  // Error handler middleware
  expressApp.use((err: Error, _req: Request, res: Response, _next: () => void) => {
    const appError = wrapError(err);
    res.status(500).json({
      error: {
        code: appError.code,
        message: appError.message,
      },
    });
  });

  const instance: ServerInstance = {
    mcpServer,
    expressApp,
    httpServer,

    start: async (options: StartOptions = {}) => {
      const { port = 3000, transport = "http" } = options;

      if (transport === "stdio") {
        // Use stdio transport
        const stdioTransport = new StdioServerTransport();
        await mcpServer.connect(stdioTransport);
        return;
      }

      // HTTP transport (default)
      return new Promise<void>((resolve, reject) => {
        try {
          httpServer = expressApp.listen(port, () => {
            instance.httpServer = httpServer;
            resolve();
          });
          httpServer.on("error", reject);
        } catch (error) {
          reject(wrapError(error));
        }
      });
    },

    stop: async () => {
      // Close all active transports
      for (const transport of Object.values(transports)) {
        await transport.close();
      }

      return new Promise<void>((resolve) => {
        if (httpServer) {
          httpServer.close(() => {
            httpServer = undefined;
            instance.httpServer = undefined;
            resolve();
          });
        } else {
          resolve();
        }
      });
    },

    handler: (): ExpressMiddleware => {
      return (req: unknown, res: unknown, next: () => void) => {
        expressApp(req as Request, res as Response, next);
      };
    },

    handleRequest: async (
      req: globalThis.Request,
      _env?: unknown
    ): Promise<globalThis.Response> => {
      // Serverless handler using Streamable HTTP transport
      try {
        const url = new URL(req.url);

        if (url.pathname === "/health") {
          return new Response(
            JSON.stringify({ status: "ok", name: config.name, version: config.version }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        // For serverless, create a one-shot transport
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });

        await mcpServer.connect(transport);

        // Convert Web Request to Express-like request
        const body: unknown = req.method === "POST" ? await req.json() : undefined;

        // Create a mock response object to capture the output
        let responseBody = "";
        let responseStatus = 200;
        const responseHeaders: Record<string, string> = {};

        const mockRes = {
          status: (code: number) => {
            responseStatus = code;
            return mockRes;
          },
          setHeader: (name: string, value: string) => {
            responseHeaders[name] = value;
          },
          json: (data: unknown) => {
            responseBody = JSON.stringify(data);
            responseHeaders["Content-Type"] = "application/json";
          },
          send: (data: string) => {
            responseBody = data;
          },
          end: (): void => {
            // No-op for serverless mock
          },
          on: () => mockRes,
          write: (chunk: string) => {
            responseBody += chunk;
          },
        };

        const mockReq = { body, headers: Object.fromEntries(req.headers) };
        await transport.handleRequest(
          mockReq as unknown as Request,
          mockRes as unknown as Response,
          body
        );

        await transport.close();

        return new Response(responseBody, {
          status: responseStatus,
          headers: responseHeaders,
        });
      } catch (error) {
        const appError = wrapError(error);
        return new Response(
          JSON.stringify({ error: appError.message }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    },
  };

  return instance;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Register tools with the MCP server
 */
function registerTools(
  mcpServer: McpServer,
  tools: ToolDefs
): void {
  for (const [name, toolDef] of Object.entries(tools)) {
    // Convert Zod schema to JSON Schema for MCP
    const inputSchema = zodToJsonSchema(toolDef.input);

    // Build annotations with visibility and UI binding
    const visibilityAnnotations = mapVisibilityToMcp(toolDef.visibility);
    const annotations: Record<string, unknown> = {
      ...visibilityAnnotations,
    };

    // Add UI binding if specified
    if (toolDef.ui) {
      annotations.ui = toolDef.ui;
    }

    // Register tool with MCP server using new registerTool API
    mcpServer.registerTool(
      name,
      {
        title: toolDef.title ?? name,
        description: toolDef.description,
        inputSchema: inputSchema as Record<string, unknown>,
        annotations: Object.keys(annotations).length > 0 ? annotations : undefined,
      },
      async (args: Record<string, unknown>) => {
        try {
          // Validate input with Zod
          const parsed: unknown = toolDef.input.parse(args);

          // Execute handler (result type is safe from the handler signature)
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const result = await toolDef.handler(parsed as z.infer<typeof toolDef.input>);

          // Return result with both text content and structuredContent
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result),
              },
            ],
            structuredContent: result as Record<string, unknown>,
          };
        } catch (error) {
          const appError = wrapError(error);
          throw new Error(`Tool execution failed: ${appError.message}`);
        }
      }
    );
  }
}

/**
 * Apply CORS configuration to Express app
 */
function applyCors(app: Express, config: CORSConfig): void {
  app.use((_req: Request, res: Response, next: () => void) => {
    const origin = config.origin;

    if (origin === true) {
      res.setHeader("Access-Control-Allow-Origin", "*");
    } else if (typeof origin === "string") {
      res.setHeader("Access-Control-Allow-Origin", origin);
    } else if (Array.isArray(origin)) {
      // For simplicity, use first origin or implement proper matching
      res.setHeader("Access-Control-Allow-Origin", origin[0]);
    }

    if (config.credentials) {
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }

    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, mcp-session-id");

    next();
  });

  // Handle preflight requests for all routes
  // Express 5 requires named parameters, use a regex pattern
  app.options(/.*/, (_req: Request, res: Response) => {
    res.sendStatus(200);
  });
}

/**
 * Register UI resources with the MCP server
 *
 * Registers each UI resource as an MCP resource with:
 * - URI format: ui://{serverName}/{resourceKey}
 * - MIME type: text/html;profile=mcp-app
 * - CSP metadata in _meta.ui.csp
 */
function registerUIResources(
  mcpServer: McpServer,
  serverName: string,
  ui: UIDefs
): void {
  for (const [key, uiDef] of Object.entries(ui)) {
    const uri = `ui://${serverName}/${key}`;

    // Build resource metadata
    const metadata: Record<string, unknown> = {
      mimeType: "text/html;profile=mcp-app",
    };

    if (uiDef.description) {
      metadata.description = uiDef.description;
    }

    // Build _meta with UI-specific properties
    const uiMeta: Record<string, unknown> = {};

    if (uiDef.csp) {
      const cspMetadata = generateMcpCSPMetadata(uiDef.csp);
      if (Object.keys(cspMetadata).length > 0) {
        uiMeta.csp = cspMetadata;
      }
    }

    if (uiDef.prefersBorder !== undefined) {
      uiMeta.prefersBorder = uiDef.prefersBorder;
    }

    if (Object.keys(uiMeta).length > 0) {
      metadata._meta = { ui: uiMeta };
    }

    // Register the resource
    mcpServer.registerResource(
      uiDef.name ?? key,
      uri,
      metadata,
      () => readUIResource(key, uiDef, uri)
    );
  }
}

/**
 * Read UI resource content
 *
 * Handles both inline HTML (starts with "<") and file paths.
 */
function readUIResource(
  key: string,
  uiDef: UIDef,
  uri: string
): { contents: Array<{ uri: string; mimeType: string; text: string }> } {
  let html: string;

  if (uiDef.html.startsWith("<")) {
    // Inline HTML
    html = uiDef.html;
  } else {
    // File path - resolve relative to current working directory
    const filePath = path.resolve(process.cwd(), uiDef.html);
    try {
      html = fs.readFileSync(filePath, "utf-8");
    } catch (error) {
      throw new Error(`Failed to read UI resource "${key}" from ${filePath}: ${(error as Error).message}`);
    }
  }

  return {
    contents: [
      {
        uri,
        mimeType: "text/html;profile=mcp-app",
        text: html,
      },
    ],
  };
}
