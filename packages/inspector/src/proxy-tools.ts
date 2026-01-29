/**
 * Proxy Tool Generator for Dual Inspector Server
 *
 * Generates tool definitions that proxy requests to the connected target server.
 * Used by the /apps/mcp endpoint to expose target server tools to ChatGPT/MCP Apps clients.
 */

import { z } from "zod";
import type { ConnectionManager } from "./connection";
import type { TargetToolInfo, McpServerLike } from "./types";
import { UIHostManager } from "./ui-host";
import { findUIResourceForTool, fetchWidgetHTML } from "./tools/helpers";

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
          } else if (Array.isArray(result.content) && result.content.length > 0) {
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
                // Use shared WidgetServer from ConnectionManager
                const sharedWidgetServer = await connectionManager.getWidgetServer();
                const uiHostManager = new UIHostManager(client, { sharedWidgetServer });
                const environmentState = connectionManager.getEnvironmentState();
                const viewport = environmentState.viewport;
                // Get external hostContext for MCP 1:1 sync
                const externalHostContext = connectionManager.getExternalMcpHostContext();
                const inspectorUrl = connectionManager.getInspectorUrl();

                const renderResult = await uiHostManager.renderInBrowser(
                  html,
                  uiResource.protocol,
                  toolResult,
                  toolInfo.name,
                  args,
                  environmentState,
                  viewport,
                  externalHostContext ?? undefined,
                  inspectorUrl ?? undefined,
                  true // isDualMode - wait for synced responses from external widget
                );

                const { page } = renderResult;

                // Extract widget session ID from URL
                const pageUrl = page.url();
                const urlMatch = pageUrl.match(/\/host\/([a-f0-9-]+)/);
                const widgetSessionId = urlMatch?.[1];

                if (!widgetSessionId) {
                  // eslint-disable-next-line no-console
                  console.warn(
                    `[proxy] Failed to extract widget session ID from URL: ${pageUrl}. Skipping session creation.`
                  );
                  // Skip session creation but continue with tool result
                } else {
                  // Create touch callback to keep WidgetServer session alive
                  const widgetServerTouch =
                    uiHostManager.createSessionTouchCallback(widgetSessionId);

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
                    },
                    widgetServerTouch
                  );

                  sessionId = session.id;
                }
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
