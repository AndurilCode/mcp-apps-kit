/**
 * Proxy Resource Generator for Dual Inspector Server
 *
 * Generates resource handlers that proxy read requests to the connected target server.
 * Used by the /apps/mcp endpoint to expose target server resources to ChatGPT/MCP Apps clients.
 */

import type { ConnectionManager } from "./connection";
import type {
  TargetResourceInfo,
  McpServerLike,
  ResourceMetadata,
  ResourceContents,
} from "./types";

/**
 * Registered proxy resource info (for tracking)
 */
export interface ProxyResourceInfo {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * Register proxy resources on an MCP server
 *
 * Creates resource registrations that forward read requests to the target server.
 * Each resource preserves the exact same URI, name, description, mimeType, and metadata.
 *
 * @param mcpServer - MCP server instance to register resources on
 * @param connectionManager - Connection manager for target server communication
 * @param resources - Target resource metadata from schema
 * @returns Array of registered resource info
 */
export function registerProxyResources(
  mcpServer: McpServerLike,
  connectionManager: ConnectionManager,
  resources: TargetResourceInfo[]
): ProxyResourceInfo[] {
  const registered: ProxyResourceInfo[] = [];

  for (const resource of resources) {
    const metadata: ResourceMetadata = {};

    if (resource.description) {
      metadata.description = resource.description;
    }
    if (resource.mimeType) {
      metadata.mimeType = resource.mimeType;
    }
    if (resource._meta) {
      metadata._meta = resource._meta;
    }
    if (resource.annotations) {
      metadata.annotations = resource.annotations;
    }

    // Register the resource with a handler that proxies to the target
    mcpServer.registerResource(
      resource.name ?? resource.uri,
      resource.uri,
      metadata,
      async (): Promise<ResourceContents> => {
        // Read from target server
        const content = await connectionManager.readTargetResource(resource.uri);

        return {
          contents: [
            {
              uri: resource.uri,
              mimeType: resource.mimeType,
              text: content ?? undefined,
              ...(resource._meta && { _meta: resource._meta }),
            },
          ],
        };
      }
    );

    registered.push({
      uri: resource.uri,
      name: resource.name ?? resource.uri,
      description: resource.description,
      mimeType: resource.mimeType,
    });
  }

  return registered;
}

/**
 * Check if any resources have UI bindings
 *
 * UI resources typically have URIs like `ui://tool-name` and mimeType:
 * - `text/html;profile=mcp-app` (MCP protocol)
 * - `text/html+skybridge` (OpenAI protocol)
 *
 * @param resources - Target resources to check
 * @returns True if any resources appear to be UI resources
 */
export function hasUIResources(resources: TargetResourceInfo[]): boolean {
  return resources.some(
    (r) =>
      r.uri.startsWith("ui://") ||
      r.mimeType === "text/html;profile=mcp-app" ||
      r.mimeType === "text/html+skybridge"
  );
}
