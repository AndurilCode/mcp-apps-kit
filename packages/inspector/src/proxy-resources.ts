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

// =============================================================================
// SYNC SCRIPT INJECTION HELPERS
// =============================================================================

/**
 * Generate the sync script that listens for environment updates and forwards to inspector
 *
 * Handles both protocols:
 * - OpenAI/ChatGPT: postMessage with type 'openai:set_globals' or CustomEvent 'openai:set_globals'
 * - MCP Apps: JSON-RPC postMessage with method 'ui/hostContextChanged'
 */
function generateSyncScript(inspectorUrl: string): string {
  return `<script data-inspector-sync>
(function() {
  var INSPECTOR_URL = ${JSON.stringify(inspectorUrl)};
  var DEBUG = true; // Enable debug logging

  function log() {
    if (DEBUG) console.log.apply(console, ['[inspector-sync]'].concat(Array.prototype.slice.call(arguments)));
  }

  function syncToInspector(globals, source) {
    log('Syncing to inspector from', source, globals);
    try {
      fetch(INSPECTOR_URL + '/sync-globals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ globals: globals })
      }).then(function(r) {
        log('Sync response:', r.status);
      }).catch(function(e) {
        log('Sync failed:', e);
      });
    } catch (e) {
      log('Sync error:', e);
    }
  }

  log('Inspector sync script loaded, listening for messages...');

  window.addEventListener('message', function(e) {
    var data = e.data;
    if (!data) return;

    // Log all messages for debugging (filter out noise)
    if (typeof data === 'object' && (data.jsonrpc || data.type || data.method)) {
      log('Received postMessage:', JSON.stringify(data).substring(0, 500));
    }

    // OpenAI/ChatGPT pattern: { type: 'openai:set_globals', globals: {...} }
    if (data.type === 'openai:set_globals' && data.globals) {
      syncToInspector(data.globals, 'openai:set_globals');
      return;
    }

    // MCP Apps pattern: JSON-RPC with method 'ui/notifications/host-context-changed'
    // Format: { jsonrpc: '2.0', method: 'ui/notifications/host-context-changed', params: { theme: '...', ... } }
    if (data.jsonrpc === '2.0' && data.method === 'ui/notifications/host-context-changed' && data.params) {
      syncToInspector(data.params, 'ui/notifications/host-context-changed');
      return;
    }

    // MCP Apps: Capture initial hostContext from ui/initialize response
    // Format: { result: { hostContext: {...}, ... } }
    if (data.result && data.result.hostContext) {
      syncToInspector(data.result.hostContext, 'ui/initialize response');
      return;
    }

    // Also check for notifications (no id field in JSON-RPC)
    if (data.jsonrpc === '2.0' && data.method && !data.id) {
      log('Received JSON-RPC notification:', data.method);
    }
  });

  // CustomEvent pattern (OpenAI SDK fires these)
  window.addEventListener('openai:set_globals', function(e) {
    log('Received openai:set_globals CustomEvent:', e.detail);
    var globals = (e.detail && e.detail.globals) ? e.detail.globals : e.detail;
    if (globals) syncToInspector(globals, 'CustomEvent');
  });
})();
</script>`;
}

/**
 * Inject the sync script into HTML content
 */
function injectSyncScript(html: string, inspectorUrl: string): string {
  const script = generateSyncScript(inspectorUrl);
  if (html.includes("</head>")) return html.replace("</head>", script + "</head>");
  if (html.includes("<body>")) return html.replace("<body>", "<body>" + script);
  return script + html;
}

/**
 * Check if resource is a UI resource that should have script injection
 */
function isUIResource(resource: TargetResourceInfo): boolean {
  return (
    resource.uri.startsWith("ui://") ||
    resource.mimeType === "text/html;profile=mcp-app" ||
    resource.mimeType === "text/html+skybridge"
  );
}

/**
 * Add inspector URL to CSP connect domains in resource metadata
 */
function addInspectorToCSP(
  meta: Record<string, unknown> | undefined,
  inspectorUrl: string
): Record<string, unknown> {
  if (!meta) return { ui: { csp: { connectDomains: [inspectorUrl] } } };

  const ui = (meta.ui as Record<string, unknown>) ?? {};
  const csp = (ui.csp as Record<string, unknown>) ?? {};
  const connectDomains = [...((csp.connectDomains as string[]) ?? [])];

  if (!connectDomains.includes(inspectorUrl)) {
    connectDomains.push(inspectorUrl);
  }

  return {
    ...meta,
    ui: { ...ui, csp: { ...csp, connectDomains } },
  };
}

// =============================================================================
// PROXY RESOURCE REGISTRATION
// =============================================================================

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

        // Check if this is a UI resource that needs sync script injection
        const inspectorUrl = connectionManager.getInspectorUrl();
        if (isUIResource(resource) && content && inspectorUrl) {
          const modifiedHTML = injectSyncScript(content, inspectorUrl);
          const modifiedMeta = addInspectorToCSP(resource._meta, inspectorUrl);

          return {
            contents: [
              {
                uri: resource.uri,
                mimeType: resource.mimeType,
                text: modifiedHTML,
                _meta: modifiedMeta,
              },
            ],
          };
        }

        // Non-UI resources pass through unchanged
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
