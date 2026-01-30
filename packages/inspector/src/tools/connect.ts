/**
 * connect_to_server tool
 *
 * Creates a new connection via the ConnectionRegistry.
 * Supports both HTTP (Streamable HTTP) and stdio (child process) transports.
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionParams } from "@mcp-apps-kit/testing";
import type { ConnectionRegistry } from "../connection-registry";
import type { ConnectOutput } from "../types";

/**
 * Zod schema for optional connection options.
 */
export const connectOptionsSchema = z
  .object({
    trackHistory: z.boolean().optional().describe("Track call history. Default: true"),
    timeout: z.number().optional().describe("Connection timeout in ms. Default: 30000"),
  })
  .optional();

/**
 * Zod schema for HTTP transport input.
 */
const httpTransportSchema = z.object({
  transport: z.literal("http"),
  url: z.string().describe("URL of the MCP server (e.g., http://localhost:3000/v1/mcp)"),
  options: connectOptionsSchema,
});

/**
 * Zod schema for stdio transport input.
 */
const stdioTransportSchema = z.object({
  transport: z.literal("stdio"),
  command: z.string().describe("Command to spawn (e.g., 'node', 'python')"),
  args: z.array(z.string()).optional().describe("Arguments for the command (e.g., ['server.js'])"),
  env: z
    .record(z.string(), z.string())
    .optional()
    .describe("Environment variables for the child process"),
  cwd: z.string().optional().describe("Working directory for the child process"),
  options: connectOptionsSchema,
});

/**
 * Zod schema for backward-compatible input (just url, no transport field).
 */
const legacyInputSchema = z.object({
  url: z.string().describe("URL of the MCP server (e.g., http://localhost:3000/v1/mcp)"),
  options: connectOptionsSchema,
});

/**
 * Zod schema for connect tool input.
 *
 * Accepts three forms:
 * 1. HTTP transport: `{ transport: "http", url: "...", options?: {...} }`
 * 2. Stdio transport: `{ transport: "stdio", command: "node", args?: ["server.js"], env?: {...}, cwd?: "...", options?: {...} }`
 * 3. Legacy (backward-compatible): `{ url: "...", options?: {...} }` — defaults to HTTP.
 */
export const connectInputSchema = z.union([
  httpTransportSchema,
  stdioTransportSchema,
  legacyInputSchema,
]);

/**
 * Zod schema for connect tool output.
 */
export const connectOutputSchema = z.object({
  connectionId: z.string().describe("Unique ID for this connection"),
  connected: z.boolean(),
  serverUrl: z
    .string()
    .describe("Display label for the connection (URL for HTTP, command for stdio)"),
  serverInfo: z
    .object({
      name: z.string(),
      version: z.string(),
    })
    .nullable(),
  toolCount: z.number(),
  resourceCount: z.number(),
  promptCount: z.number(),
});

/**
 * Connect tool output including the assigned connection id.
 */
export interface ConnectOutputWithId extends ConnectOutput {
  connectionId: string;
}

/**
 * Build ConnectionParams from validated tool input.
 *
 * Handles the three input forms (http, stdio, legacy) and normalizes
 * them into a ConnectionParams discriminated union.
 */
function buildConnectionParams(input: z.infer<typeof connectInputSchema>): ConnectionParams {
  if ("transport" in input && input.transport === "stdio") {
    const params: ConnectionParams = {
      transport: "stdio",
      command: input.command,
    };
    if (input.args) params.args = input.args;
    if (input.env) params.env = input.env;
    if (input.cwd) params.cwd = input.cwd;
    return params;
  }

  // HTTP transport (explicit or legacy)
  const url = "url" in input ? input.url : "";
  return { transport: "http", url };
}

/**
 * Build a human-readable display label for the connection.
 */
function connectionDisplayLabel(params: ConnectionParams): string {
  if (params.transport === "stdio") {
    return `stdio:${params.command}${params.args?.length ? " " + params.args.join(" ") : ""}`;
  }
  return params.url;
}

/**
 * Create the connect tool bound to a registry instance.
 *
 * @param registry - Connection registry to create connections with.
 * @returns A configured MCP tool definition.
 */
export function createConnectTool(registry: ConnectionRegistry) {
  return defineTool({
    description:
      "Connect to a target MCP server. Supports two transport modes:\n" +
      '- HTTP: Connect via Streamable HTTP. Provide { transport: "http", url: "..." } or just { url: "..." }.\n' +
      '- stdio: Spawn a local process. Provide { transport: "stdio", command: "node", args: ["server.js"], env?: {...}, cwd?: "..." }.\n' +
      "Creates a new connection and returns a connectionId for use with other tools. Multiple simultaneous connections are supported.",
    input: connectInputSchema,
    output: connectOutputSchema,
    handler: async (input): Promise<ConnectOutputWithId> => {
      const params = buildConnectionParams(input);
      const label = connectionDisplayLabel(params);

      try {
        const { id, connectionManager } = await registry.createConnection(params, input.options);

        const schema = connectionManager.getTargetSchema();

        return {
          connectionId: id,
          connected: true,
          serverUrl: connectionManager.getState().serverUrl ?? label,
          serverInfo: connectionManager.getState().serverInfo,
          toolCount: schema?.tools.length ?? 0,
          resourceCount: schema?.resources.length ?? 0,
          promptCount: schema?.prompts.length ?? 0,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes("ECONNREFUSED")) {
          throw new Error(`Connection refused: ECONNREFUSED ${label}`);
        }
        if (message.includes("timeout") || message.includes("Timeout")) {
          const timeout = input.options?.timeout ?? 30000;
          throw new Error(`Connection timeout after ${timeout}ms to ${label}`);
        }
        if (message.includes("Invalid URL")) {
          throw new Error(message);
        }
        if (message.includes("Max connections limit")) {
          throw new Error(message);
        }
        if (message.includes("ENOENT") || message.includes("spawn")) {
          throw new Error(`Failed to spawn process: ${message}`);
        }

        throw new Error(`Failed to connect to ${label}: ${message}`);
      }
    },
  });
}
