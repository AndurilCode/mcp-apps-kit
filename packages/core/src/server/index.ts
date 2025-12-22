/**
 * Server module for @apps-builder/core
 *
 * Provides MCP server implementation with Streamable HTTP and stdio transports.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express, { type Express, type Request, type Response } from "express";
import type { Server } from "http";
import { z } from "zod";

import type { ToolDefs, StartOptions, ExpressMiddleware, ToolContext, UserLocation } from "../types/tools";
import type { AppConfig, CORSConfig } from "../types/config";
import type { UIDefs, UIDef } from "../types/ui";
import { wrapError } from "../utils/errors";
import { createAdapter, type ProtocolAdapter } from "../adapters";
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
  // Create protocol adapter
  const adapter = createAdapter(config.config?.protocol ?? "mcp");

  // Create MCP server
  const mcpServer = new McpServer({
    name: config.name,
    version: config.version,
  });

  // Register tools with MCP server
  registerTools(mcpServer, config.tools, adapter, config.name);

  // Register UI resources with MCP server
  if (config.ui) {
    registerUIResources(mcpServer, config.name, config.ui, adapter);
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

  // Setup stateless Streamable HTTP endpoint for MCP
  // Each request creates a fresh transport (no session management)
  expressApp.post("/mcp", async (req: Request, res: Response) => {
    // Create stateless transport (sessionIdGenerator: undefined)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    // Close transport when response closes
    res.on("close", () => {
      void transport.close();
    });

    // Connect transport to MCP server for this request
    await mcpServer.connect(transport);

    // Handle the request
    await transport.handleRequest(req, res, req.body);
  });

  // GET endpoint - not needed for stateless mode
  expressApp.get("/mcp", (_req: Request, res: Response) => {
    res.status(405).json({ error: "GET not supported in stateless mode" });
  });

  // DELETE endpoint - not needed for stateless mode
  expressApp.delete("/mcp", (_req: Request, res: Response) => {
    res.status(405).json({ error: "DELETE not supported in stateless mode" });
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
  tools: ToolDefs,
  adapter: ProtocolAdapter,
  serverName: string
): void {
  for (const [name, toolDef] of Object.entries(tools)) {
    // Extract the Zod shape from z.object() for MCP SDK
    // MCP SDK expects inputSchema as { key: zodSchema, ... } not JSON Schema
    const zodShape = extractZodShape(toolDef.input);

    // Build annotations and _meta using the protocol adapter
    const { annotations, _meta } = adapter.buildToolMeta(toolDef, serverName);

    // Build output schema if defined
    const outputSchema = toolDef.output ? extractZodShape(toolDef.output) : undefined;

    // Register tool with MCP server using new registerTool API
    mcpServer.registerTool(
      name,
      {
        title: toolDef.title ?? name,
        description: toolDef.description,
        inputSchema: zodShape,
        outputSchema,
        annotations,
        _meta,
      },
      async (args: Record<string, unknown>, extra?: { _meta?: Record<string, unknown> }) => {
        try {
          // Validate input with Zod
          const parsed: unknown = toolDef.input.parse(args);

          // Parse client-supplied _meta into typed context
          const context = parseToolContext(extra?._meta);

          // Execute handler with input and context
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const result = await toolDef.handler(
            parsed as z.infer<typeof toolDef.input>,
            context
          );

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
 * Extract the shape from a Zod schema
 *
 * MCP SDK expects inputSchema as { key: zodSchema, ... } format
 * This extracts the shape from z.object({ ... })
 */
function extractZodShape(schema: z.ZodType): Record<string, z.ZodType> {
  // Check if it's a ZodObject and extract its shape
  if (schema instanceof z.ZodObject) {
    return schema.shape as Record<string, z.ZodType>;
  }

  // For other schema types, wrap in a single 'value' key
  return { value: schema };
}

/**
 * Parse client-supplied _meta into a typed ToolContext
 *
 * Handles both OpenAI (openai/* prefixed) and MCP formats.
 */
function parseToolContext(meta?: Record<string, unknown>): ToolContext {
  if (!meta) {
    return { raw: undefined };
  }

  const context: ToolContext = {
    raw: meta,
  };

  // Parse locale (OpenAI format or legacy webplus format)
  const locale = meta["openai/locale"] ?? meta["webplus/i18n"];
  if (typeof locale === "string") {
    context.locale = locale;
  }

  // Parse user agent
  const userAgent = meta["openai/userAgent"];
  if (typeof userAgent === "string") {
    context.userAgent = userAgent;
  }

  // Parse subject (anonymized user ID)
  const subject = meta["openai/subject"];
  if (typeof subject === "string") {
    context.subject = subject;
  }

  // Parse widget session ID
  const widgetSessionId = meta["openai/widgetSessionId"];
  if (typeof widgetSessionId === "string") {
    context.widgetSessionId = widgetSessionId;
  }

  // Parse user location
  const locationData = meta["openai/userLocation"];
  if (locationData && typeof locationData === "object") {
    const loc = locationData as Record<string, unknown>;
    const userLocation: UserLocation = {};

    if (typeof loc.city === "string") userLocation.city = loc.city;
    if (typeof loc.region === "string") userLocation.region = loc.region;
    if (typeof loc.country === "string") userLocation.country = loc.country;
    if (typeof loc.timezone === "string") userLocation.timezone = loc.timezone;
    if (typeof loc.latitude === "number") userLocation.latitude = loc.latitude;
    if (typeof loc.longitude === "number") userLocation.longitude = loc.longitude;

    if (Object.keys(userLocation).length > 0) {
      context.userLocation = userLocation;
    }
  }

  return context;
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
    } else if (Array.isArray(origin) && origin.length > 0 && origin[0]) {
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
 * Registers each UI resource as an MCP resource with protocol-specific metadata
 * generated by the adapter.
 */
function registerUIResources(
  mcpServer: McpServer,
  serverName: string,
  ui: UIDefs,
  adapter: ProtocolAdapter
): void {
  for (const [key, uiDef] of Object.entries(ui)) {
    const uri = `ui://${serverName}/${key}`;

    // Build resource metadata using the protocol adapter
    const { mimeType, _meta } = adapter.buildUIResourceMeta(uiDef);

    const metadata: Record<string, unknown> = { mimeType };

    if (uiDef.description) {
      metadata.description = uiDef.description;
    }

    if (_meta) {
      metadata._meta = _meta;
    }

    // Register the resource
    mcpServer.registerResource(
      uiDef.name ?? key,
      uri,
      metadata,
      () => readUIResource(key, uiDef, uri, mimeType, _meta)
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
  uri: string,
  mimeType: string,
  meta?: Record<string, unknown>
): { contents: Array<{ uri: string; mimeType: string; text: string; _meta?: Record<string, unknown> }> } {
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

  const content: { uri: string; mimeType: string; text: string; _meta?: Record<string, unknown> } = {
    uri,
    mimeType,
    text: html,
  };

  if (meta) {
    content._meta = meta;
  }

  return {
    contents: [content],
  };
}
