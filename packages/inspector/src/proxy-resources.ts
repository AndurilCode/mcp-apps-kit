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
 * Generate the unified sync script that listens for ALL events and forwards to inspector
 *
 * Handles both protocols:
 * - OpenAI/ChatGPT: postMessage and CustomEvent patterns for all event types
 * - MCP Apps: JSON-RPC postMessage for all notification types
 *
 * Event types captured:
 * - globals/host-context-changed: Environment state updates
 * - tool-input, tool-input-partial: Tool input data
 * - tool-output, tool-result: Tool result data
 * - tool-response-metadata: Tool metadata
 * - tool-cancelled: Tool cancellation
 * - call-tool, call-tool-response: Bidirectional tool calls
 *
 * @param inspectorUrl - The inspector server URL (e.g., "http://localhost:6274")
 * @param sessionId - Optional session ID for targeted sync
 * @param protocol - Protocol to use ("openai" or "mcp")
 */
function generateSyncScript(
  inspectorUrl: string,
  sessionId?: string,
  protocol: "openai" | "mcp" = "openai"
): string {
  return `<script data-inspector-sync>
(function() {
  var INSPECTOR_URL = ${JSON.stringify(inspectorUrl)};
  var SESSION_ID = ${sessionId ? JSON.stringify(sessionId) : "null"};
  var PROTOCOL = ${JSON.stringify(protocol)};
  var DEBUG = true;

  function log() {
    if (DEBUG) console.log.apply(console, ['[inspector-sync]'].concat(Array.prototype.slice.call(arguments)));
  }

  function syncEvent(type, data) {
    log('Syncing event:', type, data);
    try {
      fetch(INSPECTOR_URL + '/sync-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: type,
          data: data,
          sessionId: SESSION_ID,
          protocol: PROTOCOL,
          timestamp: new Date().toISOString()
        })
      }).then(function(r) {
        log('Sync response:', r.status);
      }).catch(function(e) {
        log('Sync failed:', e);
      });
    } catch (e) {
      log('Sync error:', e);
    }
  }

  log('Inspector sync script loaded, listening for ALL events...');

  // =====================================================
  // Capture initial window.openai state (OpenAI protocol)
  // ChatGPT sets toolInput/toolOutput directly on window.openai
  // before any events are fired, so we need to capture them
  // =====================================================
  function syncInitialOpenAIState() {
    var openai = window.openai;
    if (!openai) return;

    log('Capturing initial window.openai state');

    // Sync toolInput if present
    if (openai.toolInput !== undefined) {
      log('Found initial toolInput:', openai.toolInput);
      syncEvent('tool-input', openai.toolInput);
    }

    // Sync toolOutput if present
    if (openai.toolOutput !== undefined) {
      log('Found initial toolOutput:', openai.toolOutput);
      syncEvent('tool-output', openai.toolOutput);
    }

    // Sync toolResponseMetadata if present
    if (openai.toolResponseMetadata !== undefined) {
      log('Found initial toolResponseMetadata:', openai.toolResponseMetadata);
      syncEvent('tool-response-metadata', openai.toolResponseMetadata);
    }

    // Sync initial globals (theme, displayMode, etc.)
    var globals = {
      theme: openai.theme,
      displayMode: openai.displayMode,
      locale: openai.locale,
      maxHeight: openai.maxHeight,
      safeArea: openai.safeArea,
      userAgent: openai.userAgent,
      userLocation: openai.userLocation,
      toolInput: openai.toolInput,
      toolOutput: openai.toolOutput,
      toolResponseMetadata: openai.toolResponseMetadata
    };
    syncEvent('globals', globals);
  }

  // Try immediately (in case SDK already initialized)
  syncInitialOpenAIState();

  // Also try after a short delay (in case SDK initializes async)
  setTimeout(syncInitialOpenAIState, 0);
  setTimeout(syncInitialOpenAIState, 100);

  // Listen for ALL postMessage events
  window.addEventListener('message', function(e) {
    var data = e.data;
    if (!data) return;

    // Log all messages for debugging (filter out noise)
    if (typeof data === 'object' && (data.jsonrpc || data.type || data.method)) {
      log('Received postMessage:', JSON.stringify(data).substring(0, 500));
    }

    // =====================================================
    // OpenAI Protocol Events
    // =====================================================

    // OpenAI: { type: 'openai:set_globals', globals: {...} }
    if (data.type === 'openai:set_globals' && data.globals) {
      syncEvent('globals', data.globals);
      // Also extract specific tool data from globals
      if (data.globals.toolOutput !== undefined) {
        syncEvent('tool-output', data.globals.toolOutput);
      }
      if (data.globals.toolInput !== undefined) {
        syncEvent('tool-input', data.globals.toolInput);
      }
      if (data.globals.toolResponseMetadata !== undefined) {
        syncEvent('tool-response-metadata', data.globals.toolResponseMetadata);
      }
      return;
    }

    // OpenAI: Tool call response from host
    if (data.type === 'openai:callTool:response') {
      syncEvent('call-tool-response', data);
      return;
    }

    // OpenAI: Widget making tool call
    if (data.type === 'openai:callTool') {
      syncEvent('call-tool', { name: data.toolName, args: data.args });
      return;
    }

    // =====================================================
    // MCP Protocol Events (JSON-RPC)
    // =====================================================

    if (data.jsonrpc === '2.0') {
      // MCP: Host context changed notification
      if (data.method === 'ui/notifications/host-context-changed' && data.params) {
        syncEvent('host-context-changed', data.params);
        return;
      }

      // MCP: Tool result notification
      if (data.method === 'ui/notifications/tool-result' && data.params) {
        syncEvent('tool-result', data.params);
        return;
      }

      // MCP: Tool input notification
      if (data.method === 'ui/notifications/tool-input' && data.params) {
        syncEvent('tool-input', data.params);
        return;
      }

      // MCP: Tool input partial notification (streaming)
      if (data.method === 'ui/notifications/tool-input-partial' && data.params) {
        syncEvent('tool-input-partial', data.params);
        return;
      }

      // MCP: Tool cancelled notification
      if (data.method === 'ui/notifications/tool-cancelled') {
        syncEvent('tool-cancelled', data.params || {});
        return;
      }

      // MCP: Widget making tool call
      if (data.method === 'tools/call' && data.params) {
        syncEvent('call-tool', data.params);
        return;
      }

      // MCP: Initialize response contains hostContext
      // Note: data.id can be 0, so we check for undefined instead of truthiness
      if (data.id !== undefined && data.result && data.result.hostContext) {
        log('Captured ui/initialize response with hostContext');
        syncEvent('globals', data.result.hostContext);
        return;
      }

      // Log other JSON-RPC notifications for debugging
      if (data.method && data.id === undefined) {
        log('Received JSON-RPC notification:', data.method);
      }
    }
  });

  // =====================================================
  // CustomEvent Listeners (OpenAI SDK fires these)
  // =====================================================

  window.addEventListener('openai:set_globals', function(e) {
    log('Received openai:set_globals CustomEvent:', e.detail);
    var globals = (e.detail && e.detail.globals) ? e.detail.globals : e.detail;
    if (globals) {
      syncEvent('globals', globals);
      // Also extract specific tool data from globals
      if (globals.toolOutput !== undefined) {
        syncEvent('tool-output', globals.toolOutput);
      }
      if (globals.toolInput !== undefined) {
        syncEvent('tool-input', globals.toolInput);
      }
      if (globals.toolResponseMetadata !== undefined) {
        syncEvent('tool-response-metadata', globals.toolResponseMetadata);
      }
    }
  });

  // Listen for tool cancellation event
  window.addEventListener('openai:tool_cancelled', function() {
    log('Received openai:tool_cancelled CustomEvent');
    syncEvent('tool-cancelled', {});
  });
})();
</script>`;
}

/**
 * Inject the sync script into HTML content
 *
 * @param html - The HTML content to inject the script into
 * @param inspectorUrl - The inspector server URL
 * @param protocol - Protocol to use for sync ("openai" or "mcp")
 */
function injectSyncScript(
  html: string,
  inspectorUrl: string,
  protocol: "openai" | "mcp" = "openai"
): string {
  const script = generateSyncScript(inspectorUrl, undefined, protocol);
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
          // Determine protocol from mimeType
          const protocol: "openai" | "mcp" =
            resource.mimeType === "text/html;profile=mcp-app" ? "mcp" : "openai";
          const modifiedHTML = injectSyncScript(content, inspectorUrl, protocol);
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
