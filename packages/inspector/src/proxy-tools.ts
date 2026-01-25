/**
 * Proxy Tool Generator for Dual Inspector Server
 *
 * Generates tool definitions that proxy requests to the connected target server.
 * Used by the /apps/mcp endpoint to expose target server tools to ChatGPT/MCP Apps clients.
 */

import { z } from "zod";
import { defineTool, type ToolDefs } from "@mcp-apps-kit/core";
import type { ConnectionManager } from "./connection";
import type { TargetServerSchema, TargetToolInfo, McpServerLike } from "./types";
import { UIHostManager } from "./ui-host";
import { findUIResourceForTool, fetchWidgetHTML } from "./tools/helpers";

/**
 * Output schema for proxy tools
 *
 * We use z.looseObject({}) to accommodate any response from the target server.
 * This avoids the { value: ... } wrapping that happens with z.record() schemas.
 */
const proxyOutputSchema = z.looseObject({});

/**
 * Convert a JSON Schema to a Zod schema
 *
 * We use z.looseObject({}) to accept any object input.
 * This is important because the core's extractZodShape wraps non-ZodObject
 * schemas in { value: schema }, but we want direct property access.
 *
 * The actual validation is performed by the target server.
 */
function jsonSchemaToZod(_schema: Record<string, unknown> | undefined): z.ZodType {
  // Use loose object to accept any properties
  // This ensures the input is treated as a proper object schema
  // and not wrapped in { value: ... } by the core's extractZodShape
  return z.looseObject({});
}

/**
 * Generate a proxy tool that forwards calls to the target server
 *
 * @param connectionManager - Connection manager for target server communication
 * @param toolInfo - Target tool metadata
 * @returns Tool definition that proxies to target
 */
function generateProxyTool(
  connectionManager: ConnectionManager,
  toolInfo: TargetToolInfo
): ReturnType<typeof defineTool> {
  const inputSchema = jsonSchemaToZod(toolInfo.inputSchema);

  return defineTool({
    description: toolInfo.description ?? `Call ${toolInfo.name} on target server`,
    input: inputSchema,
    output: proxyOutputSchema,
    handler: async (input) => {
      const client = connectionManager.getClient();
      const startTime = Date.now();

      // eslint-disable-next-line no-console
      console.log(`[proxy] Calling ${toolInfo.name} with input:`, JSON.stringify(input));

      try {
        // Forward the tool call to the target server
        const result = await client.callTool(toolInfo.name, input as Record<string, unknown>);
        const duration = Date.now() - startTime;

        connectionManager.incrementCallCount();

        // Extract tool result for potential widget rendering
        let toolResult: unknown;
        if (result.structuredContent) {
          toolResult = result.structuredContent;
        } else if (result.content.length > 0) {
          const textContent = result.content.find(
            (c: { type: string; text?: string }) => c.type === "text"
          );
          if (textContent?.text) {
            try {
              toolResult = JSON.parse(textContent.text);
            } catch {
              toolResult = textContent.text;
            }
          }
        }

        // Check for UI resource and create widget session for ChatGPT
        let sessionId: string | undefined;
        try {
          const rawClient = client.raw;
          const uiResource = await findUIResourceForTool(rawClient, toolInfo.name);

          if (uiResource) {
            const html = await fetchWidgetHTML(rawClient, uiResource.uri);

            if (html) {
              const uiHostManager = new UIHostManager(client);
              const environmentState = connectionManager.getEnvironmentState();
              const viewport = environmentState.viewport;
              // Get external hostContext for MCP 1:1 sync
              const externalHostContext = connectionManager.getExternalMcpHostContext();

              const renderResult = await uiHostManager.renderInBrowser(
                html,
                uiResource.protocol,
                toolResult,
                toolInfo.name,
                environmentState,
                viewport,
                externalHostContext ?? undefined
              );

              const { page } = renderResult;

              // Extract widget session ID from URL
              const pageUrl = page.url();
              const urlMatch = pageUrl.match(/\/host\/([a-f0-9-]+)/);
              const widgetSessionId = urlMatch?.[1] ?? "";

              // Create widget session with 'apps' source
              const sessionManager = connectionManager.getWidgetSessionManager();
              const targetServerUrl = connectionManager.getState().serverUrl ?? "";
              const session = await sessionManager.createSession(
                toolInfo.name,
                input as Record<string, unknown>,
                toolResult,
                page,
                widgetSessionId,
                uiResource.protocol,
                "apps", // Mark as created from /apps/mcp endpoint
                {
                  targetServerUrl,
                  targetToolName: toolInfo.name,
                }
              );

              sessionId = session.id;
            }
          }
        } catch (error) {
          // Widget rendering failed, but tool call succeeded
          // eslint-disable-next-line no-console
          console.warn(`[proxy] Failed to render widget for ${toolInfo.name}:`, error);
        }

        // Return the tool result
        // For ChatGPT/MCP Apps, the structuredContent is what matters
        if (result.structuredContent) {
          return {
            ...result.structuredContent,
            _meta: {
              duration,
              sessionId,
              isError: result.isError,
            },
          };
        }

        // Fallback to text content
        const textContent = result.content.find(
          (c: { type: string; text?: string }) => c.type === "text"
        );
        return {
          result: textContent?.text ?? null,
          _meta: {
            duration,
            sessionId,
            isError: result.isError,
          },
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        const message = error instanceof Error ? error.message : String(error);

        connectionManager.incrementCallCount();

        // Return error result
        return {
          error: message,
          _meta: {
            duration,
            isError: true,
          },
        };
      }
    },
  });
}

/**
 * Generate proxy tool definitions from target server schema
 *
 * Creates ToolDefs that forward calls to the connected target server.
 * Used by the /apps/mcp endpoint to expose target tools to ChatGPT/MCP Apps clients.
 *
 * @param connectionManager - Connection manager for target server
 * @param schema - Cached schema from target server
 * @returns Tool definitions that proxy to target
 */
export function generateProxyTools(
  connectionManager: ConnectionManager,
  schema: TargetServerSchema
): ToolDefs {
  const tools: ToolDefs = {};

  for (const toolInfo of schema.tools) {
    tools[toolInfo.name] = generateProxyTool(connectionManager, toolInfo);
  }

  return tools;
}

/**
 * Check if the connection manager has a cached schema
 *
 * @param connectionManager - Connection manager to check
 * @returns True if a schema is cached
 */
export function hasTargetSchema(connectionManager: ConnectionManager): boolean {
  return connectionManager.getTargetSchema() !== null;
}

/**
 * Convert a JSON Schema's properties to Zod schema shape
 *
 * For proxy tools, we want to accept all input properties as defined in the
 * target's JSON Schema. This function creates Zod schemas that match the
 * JSON Schema properties, respecting the `required` array from the JSON Schema.
 *
 * @param jsonSchema - JSON Schema object from target server
 * @returns Zod schema shape compatible with MCP SDK
 */
function jsonSchemaToZodShape(
  jsonSchema: Record<string, unknown> | undefined
): Record<string, z.ZodType> {
  if (!jsonSchema) {
    // No schema, accept any input via a special __passthrough marker
    // The handler will receive all args as-is
    return {};
  }

  const properties = jsonSchema.properties as Record<string, unknown> | undefined;
  if (!properties) {
    return {};
  }

  // Extract required fields from JSON Schema
  const requiredFields = (jsonSchema.required as string[] | undefined) ?? [];
  const requiredSet = new Set(requiredFields);

  const shape: Record<string, z.ZodType> = {};

  for (const [key, prop] of Object.entries(properties)) {
    const propDef = prop as Record<string, unknown>;
    const type = propDef.type as string | undefined;
    const isRequired = requiredSet.has(key);

    // Create a Zod schema based on type hint
    // Only mark as optional if NOT in the required array
    let zodType: z.ZodType;
    switch (type) {
      case "string":
        zodType = z.string();
        break;
      case "number":
      case "integer":
        zodType = z.number();
        break;
      case "boolean":
        zodType = z.boolean();
        break;
      case "array":
        zodType = z.array(z.unknown());
        break;
      case "object":
        zodType = z.record(z.string(), z.unknown());
        break;
      default:
        // Fallback to unknown for any unrecognized types
        zodType = z.unknown();
    }

    // Apply optional() only for non-required fields
    shape[key] = isRequired ? zodType : zodType.optional();
  }

  return shape;
}

/**
 * Register proxy tools directly with an MCP server
 *
 * This bypasses the core's tool registration to avoid input stripping.
 * We convert the target's JSON Schema to Zod schemas that the MCP SDK expects,
 * while ensuring all input properties are preserved.
 *
 * @param mcpServer - MCP server to register tools on
 * @param connectionManager - Connection manager for target server
 * @param tools - Target tool metadata
 */
export function registerProxyToolsDirectly(
  mcpServer: McpServerLike,
  connectionManager: ConnectionManager,
  tools: TargetToolInfo[]
): void {
  for (const toolInfo of tools) {
    // Convert JSON Schema to Zod shape that MCP SDK expects
    const inputSchema = jsonSchemaToZodShape(toolInfo.inputSchema);

    mcpServer.registerTool(
      toolInfo.name,
      {
        title: toolInfo.title,
        description: toolInfo.description ?? `Call ${toolInfo.name} on target server`,
        inputSchema,
        // Note: We don't pass outputSchema since it's a JSON Schema from target,
        // not a Zod schema that MCP SDK expects. Validation happens on target server.
        // Preserve target tool metadata for ChatGPT Apps
        _meta: toolInfo._meta,
        annotations: toolInfo.annotations,
      },
      async (args: Record<string, unknown>) => {
        const client = connectionManager.getClient();
        const startTime = Date.now();

        try {
          // Forward the tool call to the target server
          const result = await client.callTool(toolInfo.name, args);
          const duration = Date.now() - startTime;

          connectionManager.incrementCallCount();

          // Extract tool result for potential widget rendering
          let toolResult: unknown;
          if (result.structuredContent) {
            toolResult = result.structuredContent;
          } else if (result.content.length > 0) {
            const textContent = result.content.find(
              (c: { type: string; text?: string }) => c.type === "text"
            );
            if (textContent?.text) {
              try {
                toolResult = JSON.parse(textContent.text);
              } catch {
                toolResult = textContent.text;
              }
            }
          }

          // Check for UI resource and create widget session for ChatGPT
          let sessionId: string | undefined;
          try {
            const rawClient = client.raw;
            const uiResource = await findUIResourceForTool(rawClient, toolInfo.name);

            if (uiResource) {
              const html = await fetchWidgetHTML(rawClient, uiResource.uri);

              if (html) {
                const uiHostManager = new UIHostManager(client);
                const environmentState = connectionManager.getEnvironmentState();
                const viewport = environmentState.viewport;
                // Get external hostContext for MCP 1:1 sync
                const externalHostContext = connectionManager.getExternalMcpHostContext();

                const renderResult = await uiHostManager.renderInBrowser(
                  html,
                  uiResource.protocol,
                  toolResult,
                  toolInfo.name,
                  environmentState,
                  viewport,
                  externalHostContext ?? undefined
                );

                const { page } = renderResult;

                // Extract widget session ID from URL
                const pageUrl = page.url();
                const urlMatch = pageUrl.match(/\/host\/([a-f0-9-]+)/);
                const widgetSessionId = urlMatch?.[1] ?? "";

                // Create widget session with 'apps' source
                const sessionManager = connectionManager.getWidgetSessionManager();
                const targetServerUrl = connectionManager.getState().serverUrl ?? "";
                const session = await sessionManager.createSession(
                  toolInfo.name,
                  args,
                  toolResult,
                  page,
                  widgetSessionId,
                  uiResource.protocol,
                  "apps", // Mark as created from /apps/mcp endpoint
                  {
                    targetServerUrl,
                    targetToolName: toolInfo.name,
                  }
                );

                sessionId = session.id;
              }
            }
          } catch (error) {
            // Widget rendering failed, but tool call succeeded
            // eslint-disable-next-line no-console
            console.warn(`[proxy] Failed to render widget for ${toolInfo.name}:`, error);
          }

          // Return the result in MCP format
          const meta: Record<string, unknown> = {
            duration,
            isError: result.isError,
          };
          if (sessionId) {
            meta.sessionId = sessionId;
          }

          return {
            content: result.content,
            structuredContent: result.structuredContent,
            _meta: meta,
          };
        } catch (error) {
          const duration = Date.now() - startTime;
          const message = error instanceof Error ? error.message : String(error);

          connectionManager.incrementCallCount();

          // Return error result in MCP format
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: message }),
              },
            ],
            isError: true,
            _meta: {
              duration,
              isError: true,
            },
          };
        }
      }
    );
  }
}
