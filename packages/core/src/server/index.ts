/**
 * Server module for @mcp-apps-kit/core
 *
 * Provides MCP server implementation with Streamable HTTP and stdio transports.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express, { type Express, type Request, type Response } from "express";
import type { Server } from "http";
import { z } from "zod";

import type {
  ToolDefs,
  StartOptions,
  ExpressMiddleware,
  ToolContext,
  UserLocation,
} from "../types/tools";
import type { AppConfig, CORSConfig, DebugConfig } from "../types/config";
import type { UIDefs, UIDef } from "../types/ui";
import type { MiddlewareContext } from "../middleware/types";
import type { EventMap } from "../events/types";
import type { TypedEventEmitter } from "../events/EventEmitter";
import { formatZodError, wrapError } from "../utils/errors";
import { createAdapter, type ProtocolAdapter } from "../adapters";
import { PluginManager } from "../plugins/PluginManager";
import { MiddlewareChain } from "../middleware/MiddlewareChain";
import { debugLogger, type LogEntry } from "../debug/logger";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

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
  /** Set middleware chain (called by createApp) */
  setMiddlewareChain: (chain: MiddlewareChain) => void;
  /** Set event emitter (called by createApp) */
  setEventEmitter: (emitter: TypedEventEmitter<EventMap & Record<string, unknown>>) => void;
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
  config: AppConfig<T>,
  pluginManager: PluginManager
): ServerInstance {
  // Create protocol adapter
  const adapter = createAdapter(config.config?.protocol ?? "mcp");

  // Create MCP server
  const mcpServer = new McpServer({
    name: config.name,
    version: config.version,
  });

  // Compute UI resource URIs with content hashes for cache busting
  const uiUriMap = config.ui ? computeUIUris(config.name, config.ui) : {};

  // Will be set by createApp
  let middlewareChainRef: MiddlewareChain | undefined;
  let eventEmitterRef: TypedEventEmitter<EventMap & Record<string, unknown>> | undefined;

  // Register debug log tool if debug logging is enabled
  registerDebugLogTool(mcpServer, config.config?.debug);

  // Register tools with MCP server (pass UI URIs for correct binding and pluginManager)
  registerTools(
    mcpServer,
    config.tools,
    adapter,
    config.name,
    uiUriMap,
    pluginManager,
    () => middlewareChainRef,
    () => eventEmitterRef
  );

  // Register UI resources with MCP server
  if (config.ui) {
    registerUIResources(mcpServer, config.ui, adapter, uiUriMap, pluginManager);
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

  // Get configurable server route (default: "/mcp")
  // Note: Validation is done in createApp's validateConfig function
  const serverRoute = config.config?.serverRoute ?? "/mcp";

  // Setup stateless Streamable HTTP endpoint for MCP
  // Each request creates a fresh transport (no session management)
  expressApp.post(serverRoute, async (req: Request, res: Response) => {
    // Call onRequest hook
    void pluginManager.executeHook("onRequest", {
      method: req.method,
      path: req.path,
      headers: req.headers as Record<string, string>,
      metadata: (req.body as { _meta?: unknown } | undefined)?._meta,
    });

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

    // Call onResponse hook after request is handled
    void pluginManager.executeHook("onResponse", {
      method: req.method,
      path: req.path,
      headers: req.headers as Record<string, string>,
      metadata: (req.body as { _meta?: unknown } | undefined)?._meta,
      statusCode: res.statusCode,
    });
  });

  // GET endpoint - not needed for stateless mode
  expressApp.get(serverRoute, (_req: Request, res: Response) => {
    res.status(405).json({ error: "GET not supported in stateless mode" });
  });

  // DELETE endpoint - not needed for stateless mode
  expressApp.delete(serverRoute, (_req: Request, res: Response) => {
    res.status(405).json({ error: "DELETE not supported in stateless mode" });
  });

  // Health check endpoint
  expressApp.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", name: config.name, version: config.version });
  });

  // Catch-all 404 handler for unregistered routes
  expressApp.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
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

    setMiddlewareChain: (chain: MiddlewareChain) => {
      middlewareChainRef = chain;
    },

    setEventEmitter: (emitter: TypedEventEmitter<EventMap & Record<string, unknown>>) => {
      eventEmitterRef = emitter;
    },

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

        // Health check endpoint
        if (url.pathname === "/health") {
          return new globalThis.Response(
            JSON.stringify({ status: "ok", name: config.name, version: config.version }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        // Validate request matches the configured serverRoute
        if (url.pathname !== serverRoute) {
          return new globalThis.Response(JSON.stringify({ error: "Not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Only POST is supported for MCP requests
        if (req.method !== "POST") {
          return new globalThis.Response(
            JSON.stringify({ error: `${req.method} not supported in stateless mode` }),
            {
              status: 405,
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

        return new globalThis.Response(responseBody, {
          status: responseStatus,
          headers: responseHeaders,
        });
      } catch (error) {
        const appError = wrapError(error);
        return new globalThis.Response(JSON.stringify({ error: appError.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    },
  };

  return instance;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Register the log_debug tool for client-side debug log transport
 *
 * This internal tool receives batched log entries from client UIs
 * and processes them through the server-side debug logger.
 */
function registerDebugLogTool(mcpServer: McpServer, debugConfig: DebugConfig | undefined): void {
  // Only register if log tool is enabled
  if (!debugConfig?.logTool) {
    return;
  }

  // Define the log entry schema
  const logEntrySchema = z.object({
    level: z.enum(["debug", "info", "warn", "error"]),
    message: z.string(),
    data: z.unknown().optional(),
    timestamp: z.string(),
    source: z.string().optional(),
  });

  const inputSchema = {
    entries: z.array(logEntrySchema).describe("Array of log entries to process"),
  };

  const outputSchema = {
    processed: z.number().describe("Number of entries processed"),
  };

  // Register the log_debug tool
  // This is an internal tool for transporting debug logs from client UIs
  // Hidden from the model (visibility: "private") but accessible to widgets
  mcpServer.registerTool(
    "log_debug",
    {
      title: "Debug Log",
      description: "Internal tool for transporting debug logs from client UIs to the server",
      inputSchema,
      outputSchema,
      _meta: {
        // Metadata to indicate this is an internal tool
        internal: true,
        // MCP visibility hint
        visibility: "app",
        // OpenAI/ChatGPT visibility: "private" hides from model, widgetAccessible: true allows widget access
        "openai/visibility": "private",
        "openai/widgetAccessible": true,
      },
    },
    async (args: Record<string, unknown>) => {
      // Validate input with Zod schema for type safety
      const parseResult = z.object(inputSchema).safeParse(args);

      if (!parseResult.success) {
        // Return error response for invalid input
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Invalid log entries",
                details: z.treeifyError(parseResult.error),
              }),
            },
          ],
          structuredContent: { processed: 0 },
        };
      }

      const { entries } = parseResult.data;

      // Process entries through the debug logger
      const processed = debugLogger.processEntries(entries as LogEntry[]);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ processed }),
          },
        ],
        structuredContent: { processed },
      };
    }
  );
}

/**
 * Register tools with the MCP server
 */
function registerTools(
  mcpServer: McpServer,
  tools: ToolDefs,
  adapter: ProtocolAdapter,
  serverName: string,
  uiUriMap: Record<string, { uri: string; html: string }>,
  pluginManager: PluginManager,
  getMiddlewareChain: () => MiddlewareChain | undefined,
  getEventEmitter: () => TypedEventEmitter<EventMap & Record<string, unknown>> | undefined
): void {
  for (const [name, toolDef] of Object.entries(tools)) {
    // Extract the Zod shape from z.object() for MCP SDK
    // MCP SDK expects inputSchema as { key: zodSchema, ... } not JSON Schema
    const zodShape = extractZodShape(toolDef.input);

    // Look up the full UI URI with hash if tool has a UI binding
    const uiUri = toolDef.ui ? uiUriMap[toolDef.ui]?.uri : undefined;

    // Build annotations and _meta using the protocol adapter
    const { annotations, _meta } = adapter.buildToolMeta(toolDef, serverName, uiUri);

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
        // Declare in outer scope for error handling
        let parsed: unknown;
        let contextForErrorHandling: ToolContext | undefined = undefined;
        const startTime = Date.now();

        try {
          // Validate input with Zod
          parsed = toolDef.input.parse(args);

          // Parse client-supplied _meta into typed context
          const baseContext = parseToolContext(extra?._meta);

          // Create state map for middleware
          const state = new Map<string, unknown>();

          // Create full context with state
          const context: ToolContext = { ...baseContext, state };
          contextForErrorHandling = context;

          // Emit tool:called event
          const eventEmitter = getEventEmitter();
          if (eventEmitter) {
            void eventEmitter.emit("tool:called", {
              toolName: name,
              input: parsed,
              context,
            });
          }

          // Create middleware context
          const middlewareContext: MiddlewareContext = {
            toolName: name,
            input: parsed,
            metadata: context,
            state,
          };

          // Define the tool execution logic
          const executeToolLogic = async (): Promise<unknown> => {
            // Execute plugin beforeToolCall hooks
            await pluginManager.executeHook("beforeToolCall", {
              toolName: name,
              input: parsed,
              metadata: context,
            });

            // Execute handler with input and context (context now includes state)
            const result = await toolDef.handler(parsed, context);

            return result;
          };

          // Execute middleware chain if present, otherwise execute tool logic directly
          let result: unknown;
          const middlewareChain = getMiddlewareChain();
          if (middlewareChain?.hasMiddleware()) {
            await middlewareChain.execute(middlewareContext, async () => {
              result = await executeToolLogic();
            });

            // Validate that middleware didn't short-circuit without providing a result
            if (result === undefined) {
              // Check if middleware set a response in context state
              if (middlewareContext.state.has("response")) {
                result = middlewareContext.state.get("response");
              } else {
                // Middleware short-circuited without calling next() or providing a result
                throw new Error(
                  `Middleware short-circuited tool execution for '${name}' without providing a result. ` +
                    `Either call next() to continue execution, or set context.state.set('response', ...) ` +
                    `to provide a response.`
                );
              }
            }
          } else {
            result = await executeToolLogic();
          }

          // Execute plugin afterToolCall hooks (isolated error handling)
          try {
            await pluginManager.executeHook(
              "afterToolCall",
              {
                toolName: name,
                input: parsed,
                metadata: context,
              },
              result
            );
          } catch (hookError) {
            // Log hook error but don't disrupt success flow
            debugLogger.error(
              `[Plugin Hook Error] afterToolCall hook failed for tool "${name}"`,
              hookError
            );
          }

          // Emit tool:success event
          const duration = Date.now() - startTime;
          if (eventEmitter) {
            void eventEmitter.emit("tool:success", {
              toolName: name,
              result,
              duration,
            });
          }

          // Extract special fields from result
          const resultObj = result as Record<string, unknown>;
          const closeWidget = resultObj._closeWidget as boolean | undefined;
          const textNarration = resultObj._text as string | undefined;

          // Build response _meta, merging user _meta with closeWidget
          let responseMeta: Record<string, unknown> | undefined;
          if (closeWidget || resultObj._meta) {
            responseMeta = { ...(resultObj._meta as Record<string, unknown> | undefined) };
            if (closeWidget) {
              responseMeta["openai/closeWidget"] = true;
            }
          }

          // Clean result for structured content (remove underscore-prefixed fields)
          const cleanResult: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(resultObj)) {
            if (!key.startsWith("_")) {
              cleanResult[key] = value;
            }
          }

          // Validate output if schema is provided
          let structured: Record<string, unknown> = cleanResult;
          if (toolDef.output) {
            try {
              // Parse/validate the cleaned output, ensuring runtime contract enforcement
              structured = toolDef.output.parse(cleanResult) as Record<string, unknown>;
            } catch (e) {
              if (e instanceof z.ZodError) {
                throw formatZodError(e);
              }
              throw e;
            }
          }

          // Model-facing text: prefer explicit narration when provided
          const contentText =
            typeof textNarration === "string" && textNarration.length > 0
              ? textNarration
              : JSON.stringify(structured);

          // Return result with both text content and structuredContent
          return {
            content: [
              {
                type: "text" as const,
                text: contentText,
              },
            ],
            structuredContent: structured,
            _meta: responseMeta,
          };
        } catch (error) {
          const duration = Date.now() - startTime;

          // Execute plugin onToolError hooks (only if context was initialized)
          if (contextForErrorHandling !== undefined) {
            await pluginManager.executeHook(
              "onToolError",
              {
                toolName: name,
                input: parsed ?? args,
                metadata: contextForErrorHandling,
              },
              error as Error
            );
          }

          // Emit tool:error event
          const eventEmitter = getEventEmitter();
          if (eventEmitter) {
            void eventEmitter.emit("tool:error", {
              toolName: name,
              error: error as Error,
              duration,
            });
          }

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
 * Compute UI resource URIs with content hashes for cache busting
 *
 * Returns a map of UI key to full URI with hash.
 */
function computeUIUris(
  serverName: string,
  ui: UIDefs
): Record<string, { uri: string; html: string }> {
  const result: Record<string, { uri: string; html: string }> = {};

  for (const [key, uiDef] of Object.entries(ui)) {
    const html = readUIHtml(key, uiDef);
    const contentHash = crypto.createHash("sha256").update(html).digest("hex").substring(0, 8);
    const uri = `ui://${serverName}/${key}?v=${contentHash}`;
    result[key] = { uri, html };
  }

  return result;
}

/**
 * Register UI resources with the MCP server
 *
 * Registers each UI resource as an MCP resource with protocol-specific metadata
 * generated by the adapter.
 */
function registerUIResources(
  mcpServer: McpServer,
  ui: UIDefs,
  adapter: ProtocolAdapter,
  uiUriMap: Record<string, { uri: string; html: string }>,
  pluginManager: PluginManager
): void {
  for (const [key, uiDef] of Object.entries(ui)) {
    const uiEntry = uiUriMap[key];
    if (!uiEntry) {
      throw new Error(`UI resource "${key}" not found in URI map`);
    }
    const { uri, html } = uiEntry;

    // Build resource metadata using the protocol adapter
    const { mimeType, _meta } = adapter.buildUIResourceMeta(uiDef);

    const metadata: Record<string, unknown> = { mimeType };

    if (uiDef.description) {
      metadata.description = uiDef.description;
    }

    if (_meta) {
      metadata._meta = _meta;
    }

    // Register the resource with pre-loaded HTML
    mcpServer.registerResource(uiDef.name ?? key, uri, metadata, () => {
      // Call onUILoad hook when UI resource is loaded
      void pluginManager.executeHook("onUILoad", {
        uiKey: key,
        uri,
      });

      return {
        contents: [
          {
            uri,
            mimeType,
            text: html,
            ...(_meta && { _meta }),
          },
        ],
      };
    });
  }
}

/**
 * Read UI HTML content
 *
 * Handles both inline HTML (starts with "<") and file paths.
 */
function readUIHtml(key: string, uiDef: UIDef): string {
  if (uiDef.html.startsWith("<")) {
    // Inline HTML
    return uiDef.html;
  }

  // File path - resolve relative to current working directory
  const filePath = path.resolve(process.cwd(), uiDef.html);
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (error) {
    throw new Error(
      `Failed to read UI resource "${key}" from ${filePath}: ${(error as Error).message}`
    );
  }
}
