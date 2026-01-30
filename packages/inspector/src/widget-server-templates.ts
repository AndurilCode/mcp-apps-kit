/**
 * Widget Server Templates
 *
 * HTML template generation for MCP and OpenAI widget host pages.
 * Extracted from widget-server.ts for better separation of concerns.
 *
 * ## Template Types
 *
 * - **MCP Host Page**: Full iframe host with JSON-RPC message handling
 * - **OpenAI Host Page**: Lightweight host that relies on injected runtime
 * - **OpenAI Runtime**: Bootstrap script injected into widget HTML
 *
 * ## Shared Utilities
 *
 * - DOM event recording for interaction capture
 * - CSS selector generation for element identification
 * - Common styles for host page layout
 */

import type { WidgetSession } from "./widget-server";
import { DISPLAY_MODE_SIZES } from "./types/environment-types";

// ============================================================================
// Types
// ============================================================================

/**
 * Context for MCP host page generation
 */
export interface McpHostContext {
  session: WidgetSession;
  widgetUrl: string;
  /** JSON-serialized tool result */
  toolResultJson: string;
  /** JSON-serialized tool name */
  toolNameJson: string;
  /** JSON-serialized tool arguments (input) */
  toolArgsJson: string;
  /** Theme from hostContext or environment */
  theme: string;
  /** Display mode */
  displayMode: string;
  /** Locale setting */
  locale: string;
  /** Timezone */
  timeZone: string;
  /** Platform (mobile/desktop) */
  platform: string;
  /** JSON-serialized external hostContext */
  externalHostContextJson: string;
}

/**
 * Context for OpenAI host page generation
 */
export interface OpenAIHostContext {
  session: WidgetSession;
  widgetUrl: string;
}

/**
 * Context for OpenAI runtime injection
 */
export interface OpenAIRuntimeContext {
  session: WidgetSession;
  /** JSON-serialized tool result */
  toolResultJson: string;
  /** JSON-serialized tool name */
  toolNameJson: string;
  /** JSON-serialized subject ID */
  subjectIdJson: string;
  /** JSON-serialized session ID */
  sessionIdJson: string;
  /** JSON-serialized locale */
  localeJson: string;
  /** JSON-serialized theme */
  themeJson: string;
  /** JSON-serialized display mode */
  displayModeJson: string;
  /** Max height as string or "null" */
  maxHeightJson: string;
  /** JSON-serialized safe area insets */
  safeAreaJson: string;
  /** JSON-serialized user agent info */
  userAgentJson: string;
  /** JSON-serialized user location */
  userLocationJson: string;
}

// ============================================================================
// Shared Utilities
// ============================================================================

/**
 * Common CSS styles for host pages
 */
export const HOST_PAGE_STYLES = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    iframe { width: 100%; height: 100%; border: none; }
`;

/**
 * Sandbox attributes for widget iframes
 */
export const IFRAME_SANDBOX = "allow-scripts allow-same-origin allow-forms allow-modals";

/**
 * Escape HTML special characters to prevent XSS
 * Used when inserting user-controlled strings into HTML templates
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Generate the getSelector helper function for DOM event recording
 * This function creates a CSS selector string for a given element
 */
export function generateGetSelectorScript(): string {
  return `
      // Helper to get a CSS selector for an element
      function getSelector(el) {
        if (!el || el === document.body || el === document.documentElement) return 'body';
        if (el.id) return '#' + el.id;
        if (el.dataset && el.dataset.testid) return '[data-testid="' + el.dataset.testid + '"]';
        var selector = el.tagName.toLowerCase();
        if (el.className && typeof el.className === 'string') {
          selector += '.' + el.className.trim().split(/\\s+/).join('.');
        }
        return selector;
      }`;
}

/**
 * Generate the recordEvent helper function for sending events to inspector
 *
 * @param protocol - "mcp" or "openai"
 * @param sessionIdVar - JavaScript variable name containing session ID
 * @param inspectorUrlVar - JavaScript variable name containing inspector URL
 * @param isDualModeVar - JavaScript variable name containing dual mode flag
 */
export function generateRecordEventScript(
  protocol: "mcp" | "openai",
  sessionIdVar: string = "sessionId",
  inspectorUrlVar: string = "inspectorUrl",
  isDualModeVar: string = "isDualMode"
): string {
  const logPrefix = protocol === "mcp" ? "[MCP Host]" : "[OpenAI Host]";
  return `
      // Helper to record events to the inspector server (only in standalone mode)
      // In dual mode, events are captured via /sync-events from the external widget
      function recordEvent(type, payload, source) {
        if (!${inspectorUrlVar} || ${isDualModeVar}) return;
        fetch(${inspectorUrlVar} + '/record-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: ${sessionIdVar},
            type: type,
            payload: payload,
            source: source || 'host',
            protocol: '${protocol}'
          })
        }).catch(function(err) {
          console.warn('${logPrefix} Failed to record event:', err);
        });
      }`;
}

/**
 * Generate DOM event listeners that attach to an iframe's document
 *
 * @param iframeDocVar - JavaScript variable name for iframe document
 * @param recordEventFn - Name of the recordEvent function to call
 */
export function generateDomEventListenersScript(
  iframeDocVar: string = "iframeDoc",
  recordEventFn: string = "recordEvent"
): string {
  return `
          // Click events
          ${iframeDocVar}.addEventListener('click', function(e) {
            ${recordEventFn}('dom-click', {
              selector: getSelector(e.target),
              x: e.clientX,
              y: e.clientY
            }, 'widget');
          }, true);

          // Input events
          ${iframeDocVar}.addEventListener('input', function(e) {
            var target = e.target;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
              ${recordEventFn}('dom-input', {
                selector: getSelector(target),
                value: target.value,
                inputType: target.type
              }, 'widget');
            }
          }, true);

          // Change events (for select, checkbox, radio)
          ${iframeDocVar}.addEventListener('change', function(e) {
            var target = e.target;
            var payload = { selector: getSelector(target) };
            if (target.tagName === 'SELECT') {
              payload.value = target.value;
              payload.values = Array.from(target.selectedOptions).map(function(o) { return o.value; });
            } else if (target.type === 'checkbox' || target.type === 'radio') {
              payload.checked = target.checked;
              payload.inputType = target.type;
            } else {
              payload.value = target.value;
            }
            ${recordEventFn}('dom-change', payload, 'widget');
          }, true);

          // Focus events
          ${iframeDocVar}.addEventListener('focus', function(e) {
            ${recordEventFn}('dom-focus', { selector: getSelector(e.target) }, 'widget');
          }, true);

          // Blur events
          ${iframeDocVar}.addEventListener('blur', function(e) {
            ${recordEventFn}('dom-blur', { selector: getSelector(e.target) }, 'widget');
          }, true);

          // Scroll events (debounced)
          var scrollTimeout;
          ${iframeDocVar}.addEventListener('scroll', function(e) {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(function() {
              var target = e.target;
              ${recordEventFn}('dom-scroll', {
                selector: target === ${iframeDocVar} ? null : getSelector(target),
                scrollTop: target.scrollTop || ${iframeDocVar}.documentElement.scrollTop,
                scrollLeft: target.scrollLeft || ${iframeDocVar}.documentElement.scrollLeft
              }, 'widget');
            }, 100);
          }, true);

          // Keydown events (for special keys)
          ${iframeDocVar}.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === 'Escape' || e.key === 'Tab' || e.ctrlKey || e.metaKey) {
              ${recordEventFn}('dom-keydown', {
                selector: getSelector(e.target),
                key: e.key,
                modifiers: {
                  ctrl: e.ctrlKey,
                  alt: e.altKey,
                  shift: e.shiftKey,
                  meta: e.metaKey
                }
              }, 'widget');
            }
          }, true);`;
}

// ============================================================================
// MCP Host Page Template
// ============================================================================

/**
 * Generate MCP host page HTML
 *
 * Creates a host page that:
 * - Embeds the widget in an iframe
 * - Handles JSON-RPC 2.0 message protocol
 * - Responds to ui/initialize with hostContext
 * - Sends tool results via ui/notifications/tool-result
 * - Proxies tools/call to inspector or returns mock results
 * - Records DOM events for interaction capture
 */
export function generateMcpHostPage(ctx: McpHostContext): string {
  const { session, widgetUrl, toolResultJson, toolNameJson, toolArgsJson } = ctx;
  const { theme, displayMode, locale, timeZone, platform, externalHostContextJson } = ctx;
  const env = session.environmentState;
  const sizingPlatform = platform === "mobile" ? "mobile" : "desktop";
  const displayModeSizesJson = JSON.stringify(DISPLAY_MODE_SIZES);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MCP Widget Host - ${escapeHtml(session.toolName)}</title>
  <style>${HOST_PAGE_STYLES}</style>
</head>
<body>
  <iframe id="widget-frame" src="${widgetUrl}" sandbox="${IFRAME_SANDBOX}"></iframe>
  <script>
    (function() {
      const toolResult = ${toolResultJson};
      const toolName = ${toolNameJson};
      const toolArgs = ${toolArgsJson};
      const sessionId = ${JSON.stringify(session.id)};
      const inspectorUrl = ${JSON.stringify(session.inspectorUrl ?? null)};
      const isDualMode = ${JSON.stringify(session.isDualMode ?? false)};
      const iframe = document.getElementById('widget-frame');
      let initialized = false;

      // Display mode size presets (canonical format: [platform][mode])
      var DISPLAY_MODE_SIZES = ${displayModeSizesJson};
      var currentDisplayMode = '${displayMode}';
      var currentPlatform = '${sizingPlatform}';
      var currentSizing = (DISPLAY_MODE_SIZES[currentPlatform] && DISPLAY_MODE_SIZES[currentPlatform][currentDisplayMode]) || DISPLAY_MODE_SIZES.desktop.inline;

      // Set initial iframe CSS based on display mode (Bug 4 fix)
      if (currentDisplayMode !== 'fullscreen') {
        iframe.style.width = currentSizing.width + 'px';
        iframe.style.height = 'auto';
        if (currentSizing.maxHeight) {
          iframe.style.maxHeight = currentSizing.maxHeight + 'px';
        }
      }

      // External hostContext from ui/initialize sync (captured before session creation)
      const externalHostContext = ${externalHostContextJson};

      // Fallback hostContext values (from session.environmentState)
      const fallbackHostContext = {
        theme: '${theme}',
        displayMode: '${displayMode}',
        availableDisplayModes: ['inline', 'fullscreen'],
        locale: '${locale}',
        timeZone: '${timeZone}',
        platform: '${platform}',
        viewport: ${JSON.stringify(env?.viewport ?? { width: 800, height: 600 })},
        containerDimensions: currentDisplayMode === 'fullscreen'
          ? { width: currentSizing.width, height: currentSizing.height }
          : { width: currentSizing.width, maxHeight: currentSizing.maxHeight },
        toolInfo: {
          tool: { name: toolName, inputSchema: { type: 'object' } },
        },
      };
${generateRecordEventScript("mcp")}
${generateGetSelectorScript()}

      // Set up DOM event listeners on iframe once loaded
      iframe.addEventListener('load', function() {
        try {
          var iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
${generateDomEventListenersScript()}

          console.log('[MCP Host] DOM event listeners attached');
        } catch (err) {
          console.warn('[MCP Host] Cannot attach DOM listeners (cross-origin):', err);
        }
      });

      // Listen for messages from the widget
      window.addEventListener('message', function(event) {
        // Only accept messages from our iframe
        if (event.source !== iframe.contentWindow) return;

        const message = event.data;
        if (!message || message.jsonrpc !== '2.0') return;

        console.log('[MCP Host] Received:', JSON.stringify(message));

        // Handle ui/initialize request
        if (message.method === 'ui/initialize') {
          initialized = true;

          // Build hostContext: fallback -> external (pre-session) -> runtime updates
          // This ensures external widget's hostContext is reflected in Playwright widget
          const runtimeUpdates = window.__mcpHostContextUpdates || {};
          const hostContext = { ...fallbackHostContext, ...externalHostContext, ...runtimeUpdates };
          console.log('[MCP Host] Using hostContext:', JSON.stringify(hostContext));

          // Record initialize event
          recordEvent('initialize', { toolName: toolName, hostContext: hostContext }, 'widget');

          const response = {
            jsonrpc: '2.0',
            id: message.id,
            result: {
              protocolVersion: '2025-11-21',
              hostInfo: {
                name: 'MCP Inspector Host',
                version: '1.0.0',
              },
              hostCapabilities: {
                logging: {},
                serverTools: {},
              },
              hostContext: hostContext,
            },
          };
          iframe.contentWindow.postMessage(response, '*');
          console.log('[MCP Host] Sent ui/initialize response');

          // Send tool input first (the arguments passed to the tool)
          // Method: 'ui/notifications/tool-input', params: { arguments: {...} }
          setTimeout(function() {
            const inputMessage = {
              jsonrpc: '2.0',
              method: 'ui/notifications/tool-input',
              params: {
                arguments: toolArgs,
              },
            };
            iframe.contentWindow.postMessage(inputMessage, '*');
            console.log('[MCP Host] Sent ui/notifications/tool-input');

            // Record tool-input event
            recordEvent('tool-input', { toolName: toolName, args: toolArgs }, 'host');
          }, 25);

          // Send tool result after a short delay
          // Method: 'ui/notifications/tool-result', params: CallToolResult (not wrapped in 'result')
          setTimeout(function() {
            const resultMessage = {
              jsonrpc: '2.0',
              method: 'ui/notifications/tool-result',
              params: {
                structuredContent: toolResult,
                content: [{ type: 'text', text: JSON.stringify(toolResult) }],
              },
            };
            iframe.contentWindow.postMessage(resultMessage, '*');
            console.log('[MCP Host] Sent ui/notifications/tool-result');

            // Record tool-result event
            recordEvent('tool-result', { toolName: toolName, result: toolResult }, 'host');
          }, 50);
        }

        // Handle tools/call requests (bidirectional)
        if (message.method === 'tools/call') {
          // Store for get_widget_state observation
          window.__inspectorToolCalls = window.__inspectorToolCalls || [];
          window.__inspectorToolCalls.push({
            name: message.params.name,
            args: message.params.arguments,
            timestamp: Date.now()
          });

          console.log('[WIDGET_TOOL_CALL] ' + JSON.stringify({
            name: message.params.name,
            args: message.params.arguments,
          }));

          // Use outer-scope inspectorUrl and isDualMode variables (declared at top of IIFE)

          if (isDualMode) {
            // In dual mode, wait for synced tool response from external widget
            // instead of executing the call ourselves (which would duplicate)
            window.__pendingToolCalls = window.__pendingToolCalls || {};
            window.__pendingToolCalls[message.params.name] = window.__pendingToolCalls[message.params.name] || [];
            window.__pendingToolCalls[message.params.name].push({
              messageId: message.id,
              args: message.params.arguments,
              timestamp: Date.now()
            });
            console.log('[MCP Host] Dual mode: queued tool call, waiting for synced response:', message.params.name);

            // Set a timeout to return mock result if no sync arrives
            setTimeout(function() {
              var pending = window.__pendingToolCalls && window.__pendingToolCalls[message.params.name];
              if (pending) {
                var idx = pending.findIndex(function(p) { return p.messageId === message.id; });
                if (idx !== -1) {
                  pending.splice(idx, 1);
                  console.log('[MCP Host] Tool call timed out, returning mock:', message.params.name);
                  iframe.contentWindow.postMessage({
                    jsonrpc: '2.0',
                    id: message.id,
                    result: { content: [{ type: 'text', text: '{"synced": false, "timeout": true}' }] }
                  }, '*');
                }
              }
            }, 10000); // 10 second timeout
          } else if (inspectorUrl) {
            // Standalone mode: execute on connected server via inspector endpoint
            fetch(inspectorUrl + '/execute-tool', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId: sessionId,
                toolName: message.params.name,
                args: message.params.arguments,
                messageId: message.id
              })
            })
            .then(function(res) { return res.json(); })
            .then(function(result) {
              iframe.contentWindow.postMessage({
                jsonrpc: '2.0',
                id: message.id,
                result: result
              }, '*');
              console.log('[MCP Host] Tool call executed:', message.params.name);
            })
            .catch(function(err) {
              console.error('[MCP Host] Tool call failed:', err);
              iframe.contentWindow.postMessage({
                jsonrpc: '2.0',
                id: message.id,
                error: { code: -32000, message: 'Tool execution failed: ' + err.message }
              }, '*');
            });
          } else {
            // No inspector URL - return mock result (for tests or offline)
            console.log('[MCP Host] No inspector URL, returning mock result');
            const callResponse = {
              jsonrpc: '2.0',
              id: message.id,
              result: {
                content: [{ type: 'text', text: '{"mock": true}' }],
              },
            };
            iframe.contentWindow.postMessage(callResponse, '*');
          }
        }

        // Handle logging/sendMessage
        if (message.method === 'logging/sendMessage') {
          console.log('[MCP Widget Log]', message.params.level, message.params.data);
        }

        // Handle ui/notifications/size-changed
        if (message.method === 'ui/notifications/size-changed' && message.params) {
          var scWidth = message.params.width;
          var scHeight = message.params.height;
          console.log('[MCP Host] Size changed:', scWidth, 'x', scHeight);

          // In fullscreen mode, skip iframe CSS mutation and environment update (Bug 1 fix)
          if (currentDisplayMode === 'fullscreen') {
            console.log('[MCP Host] Fullscreen mode - ignoring size change');
          } else {
            // Resize iframe CSS
            var scIframe = document.getElementById('widget-frame');
            if (scIframe && scHeight) {
              scIframe.style.height = scHeight + 'px';
            }

            // Forward to /update-environment (debounced, dedup)
            if (inspectorUrl && scHeight !== window.__mcpLastSentHeight) {
              window.__mcpLastSentHeight = scHeight;
              clearTimeout(window.__mcpSizeTimer);
              window.__mcpSizeTimer = setTimeout(function() {
                var resolvedWidth = (scWidth !== null && scWidth !== undefined ? scWidth : 800);
                fetch(inspectorUrl + '/update-environment', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    sessionId: sessionId,
                    globals: { viewport: { width: resolvedWidth, height: scHeight } }
                  })
                }).then(function(res) {
                  console.log('[MCP Host] Size change forwarded, status:', res.status);
                }).catch(function(err) {
                  console.warn('[MCP Host] Failed to forward size change:', err);
                });
              }, 100);
            }
          }
        }
      });

      console.log('[MCP Host] Ready, waiting for widget to initialize...');
    })();
  </script>
</body>
</html>`;
}

// ============================================================================
// OpenAI Host Page Template
// ============================================================================

/**
 * Generate OpenAI host page HTML
 *
 * Creates a lightweight host page that:
 * - Embeds the widget in an iframe (runtime is injected into widget HTML)
 * - Handles postMessage events from the widget
 * - Proxies tool calls to inspector or returns mock results
 * - Records DOM events for interaction capture
 * - Tracks widget state changes, resize, navigation, errors
 */
export function generateOpenAIHostPage(ctx: OpenAIHostContext): string {
  const { session, widgetUrl } = ctx;
  const openaiEnv = session.environmentState;
  const openaiInitialDisplayMode = openaiEnv?.displayMode ?? "inline";
  const openaiSizingPlatform =
    openaiEnv?.userAgent?.device?.type === "mobile" ? "mobile" : "desktop";
  const openaiDisplayModeSizesJson = JSON.stringify(DISPLAY_MODE_SIZES);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenAI Widget Host - ${escapeHtml(session.toolName)}</title>
  <style>${HOST_PAGE_STYLES}</style>
</head>
<body>
  <iframe id="widget-frame" src="${widgetUrl}" sandbox="${IFRAME_SANDBOX}"></iframe>
  <script>
    (function() {
      const sessionId = ${JSON.stringify(session.id)};
      const toolName = ${JSON.stringify(session.toolName)};
      const inspectorUrl = ${JSON.stringify(session.inspectorUrl ?? null)};
      const isDualMode = ${JSON.stringify(session.isDualMode ?? false)};
      const iframe = document.getElementById('widget-frame');
      let initialized = false;

      // Display mode size presets (canonical format: [platform][mode])
      var DISPLAY_MODE_SIZES = ${openaiDisplayModeSizesJson};
      var initialPlatform = '${openaiSizingPlatform}';
      var initialMode = '${openaiInitialDisplayMode}';
      var initialSizing = (DISPLAY_MODE_SIZES[initialPlatform] && DISPLAY_MODE_SIZES[initialPlatform][initialMode]) || DISPLAY_MODE_SIZES.desktop.inline;

      // Initialize __hostState with display mode and viewport (Bug 1 + Bug 2 prerequisite)
      window.__hostState = {
        displayMode: initialMode,
        viewport: { width: initialSizing.width, height: initialSizing.height },
        heights: [],
        navigations: [],
        cspViolations: [],
        errors: [],
        storageChanges: []
      };

      // Set initial iframe CSS based on display mode (Bug 4 fix)
      if (initialMode !== 'fullscreen') {
        iframe.style.width = initialSizing.width + 'px';
        iframe.style.height = 'auto';
        if (initialSizing.maxHeight) {
          iframe.style.maxHeight = initialSizing.maxHeight + 'px';
        }
      }

${generateRecordEventScript("openai")}
${generateGetSelectorScript()}

      // Set up DOM event listeners on iframe once loaded
      iframe.addEventListener('load', function() {
        // Record initialize event when iframe loads
        if (!initialized) {
          initialized = true;
          recordEvent('initialize', { toolName: toolName }, 'widget');
        }

        try {
          var iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
${generateDomEventListenersScript()}

          console.log('[OpenAI Host] DOM event listeners attached');
        } catch (err) {
          console.warn('[OpenAI Host] Cannot attach DOM listeners (cross-origin):', err);
        }
      });

      window.addEventListener('message', function(event) {
        // Only accept messages from our iframe
        if (event.source !== iframe.contentWindow) return;

        const message = event.data;
        console.log('[OpenAI Host] Received:', JSON.stringify(message));

        // Handle widget tool calls
        if (message && message.type === 'openai:callTool') {
          // Store for get_widget_state observation
          window.__inspectorToolCalls = window.__inspectorToolCalls || [];
          window.__inspectorToolCalls.push({
            name: message.toolName,
            args: message.args,
            timestamp: Date.now()
          });

          console.log('[WIDGET_TOOL_CALL]', message.toolName, message.args);

        if (isDualMode) {
          // In dual mode, wait for synced tool response from external widget
          // instead of executing the call ourselves (which would duplicate)
          window.__pendingToolCalls = window.__pendingToolCalls || {};
          window.__pendingToolCalls[message.toolName] = window.__pendingToolCalls[message.toolName] || [];
          window.__pendingToolCalls[message.toolName].push({
            callId: message.callId,
            args: message.args,
            timestamp: Date.now()
          });
          console.log('[OpenAI Host] Dual mode: queued tool call, waiting for synced response:', message.toolName);

          // Set a timeout to return mock result if no sync arrives
          setTimeout(function() {
            var pending = window.__pendingToolCalls && window.__pendingToolCalls[message.toolName];
            if (pending) {
              var idx = pending.findIndex(function(p) { return p.callId === message.callId; });
              if (idx !== -1) {
                pending.splice(idx, 1);
                console.log('[OpenAI Host] Tool call timed out, returning mock:', message.toolName);
                iframe.contentWindow.postMessage({
                  type: 'openai:callTool:response',
                  callId: message.callId,
                  result: { output: '{"synced": false, "timeout": true}' }
                }, '*');
              }
            }
          }, 10000); // 10 second timeout
        } else if (inspectorUrl) {
          // Standalone mode: execute on connected server via inspector endpoint
          fetch(inspectorUrl + '/execute-tool', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: sessionId,
              toolName: message.toolName,
              args: message.args,
              callId: message.callId
            })
          })
          .then(function(res) { return res.json(); })
          .then(function(result) {
            iframe.contentWindow.postMessage({
              type: 'openai:callTool:response',
              callId: message.callId,
              result: result
            }, '*');
            console.log('[OpenAI Host] Tool call executed:', message.toolName);
          })
          .catch(function(err) {
            console.error('[OpenAI Host] Tool call failed:', err);
            iframe.contentWindow.postMessage({
              type: 'openai:callTool:response',
              callId: message.callId,
              error: 'Tool execution failed: ' + err.message
            }, '*');
          });
        } else {
          // No inspector URL - return mock result (for tests or offline)
          console.log('[OpenAI Host] No inspector URL, returning mock result');
          iframe.contentWindow.postMessage({
            type: 'openai:callTool:response',
            callId: message.callId,
            result: { output: '{"mock": true}' }
          }, '*');
        }
      }

      // Handle state changes
      if (message && message.type === 'openai:setWidgetState') {
        console.log('[OpenAI Host] Widget state changed:', message.state);
      }

      // Handle resize
      if (message && message.type === 'openai:resize') {
        var newHeight = message.height;
        console.log('[OpenAI Host] Widget height:', newHeight);
        // Track height changes for test assertions
        window.__hostState.heights.push({ height: newHeight, timestamp: Date.now() });

        // In fullscreen mode, skip iframe CSS mutation and environment update (Bug 1 fix)
        if (window.__hostState.displayMode === 'fullscreen') {
          console.log('[OpenAI Host] Fullscreen mode - ignoring resize');
        } else {
          // Resize iframe CSS
          var iframeEl = document.getElementById('widget-frame');
          if (iframeEl) {
            iframeEl.style.height = newHeight + 'px';
          }

          // Forward to /update-environment using current viewport width (Bug 2 fix)
          var currentWidth = (window.__hostState && window.__hostState.viewport) ? window.__hostState.viewport.width : 800;
          if (inspectorUrl && newHeight !== window.__lastSentHeight) {
            window.__lastSentHeight = newHeight;
            clearTimeout(window.__resizeTimer);
            window.__resizeTimer = setTimeout(function() {
              fetch(inspectorUrl + '/update-environment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  sessionId: sessionId,
                  globals: { viewport: { width: currentWidth, height: newHeight } }
                })
              }).then(function(res) {
                console.log('[OpenAI Host] Resize forwarded, status:', res.status);
              }).catch(function(err) {
                console.warn('[OpenAI Host] Failed to forward resize:', err);
              });
            }, 100);
          }
        }
      }

      // Handle navigation
      if (message && message.type === 'openai:navigation') {
        console.log('[OpenAI Host] Navigation:', message.url, message.title);
        window.__hostState = window.__hostState || {};
        window.__hostState.navigations = window.__hostState.navigations || [];
        window.__hostState.navigations.push({ url: message.url, title: message.title, timestamp: Date.now() });
      }

      // Handle CSP violations
      if (message && message.type === 'openai:cspViolation') {
        console.error('[OpenAI Host] CSP Violation:', message.violation);
        window.__hostState = window.__hostState || {};
        window.__hostState.cspViolations = window.__hostState.cspViolations || [];
        window.__hostState.cspViolations.push(message.violation);
      }

      // Handle errors
      if (message && message.type === 'openai:error') {
        console.error('[OpenAI Host] Widget Error:', message.error);
        window.__hostState = window.__hostState || {};
        window.__hostState.errors = window.__hostState.errors || [];
        window.__hostState.errors.push(message.error);
      }

      // Handle modal requests
      if (message && message.type === 'openai:requestModal') {
        console.log('[OpenAI Host] Modal requested:', message.params, message.template);
        // Return empty result (inspector can't spawn real modals)
        iframe.contentWindow.postMessage({
          type: 'openai:modal:response',
          modalId: message.modalId,
          result: { dismissed: true, reason: 'inspector_mock' }
        }, '*');
      }

      // Handle setOpenInAppUrl
      if (message && message.type === 'openai:setOpenInAppUrl') {
        console.log('[OpenAI Host] Open in app URL set:', message.href);
        window.__hostState = window.__hostState || {};
        window.__hostState.openInAppUrl = message.href;
      }

      // Handle storage changes
      if (message && message.type === 'openai:storageChange') {
        console.log('[OpenAI Host] Storage changed:', message.key, message.newValue);
        window.__hostState = window.__hostState || {};
        window.__hostState.storageChanges = window.__hostState.storageChanges || [];
        window.__hostState.storageChanges.push({
          key: message.key,
          oldValue: message.oldValue,
          newValue: message.newValue,
          url: message.url,
          timestamp: Date.now()
        });
      }

      // Handle requestDisplayMode from widget
      if (message && message.type === 'openai:requestDisplayMode') {
        var mode = message.mode;
        console.log('[OpenAI Host] Display mode requested:', mode);
        
        // Calculate new sizing using top-level DISPLAY_MODE_SIZES (canonical: [platform][mode])
        var sizing = (DISPLAY_MODE_SIZES[initialPlatform] && DISPLAY_MODE_SIZES[initialPlatform][mode]) || DISPLAY_MODE_SIZES.desktop.inline;
        
        // Update host state
        window.__hostState.displayMode = mode;
        window.__hostState.viewport = { width: sizing.width, height: sizing.height };

        // Update iframe CSS based on new display mode (Bug 4 - dynamic mode switch)
        if (mode === 'fullscreen') {
          iframe.style.width = '100%';
          iframe.style.height = '100%';
          iframe.style.maxHeight = '';
        } else {
          iframe.style.width = sizing.width + 'px';
          iframe.style.height = 'auto';
          iframe.style.maxHeight = sizing.maxHeight ? (sizing.maxHeight + 'px') : '';
        }
        
        // Record the event
        recordEvent('globals', { displayMode: mode, viewport: window.__hostState.viewport }, 'widget');
        
        // Notify inspector to resize Playwright viewport
        if (inspectorUrl) {
          fetch(inspectorUrl + '/update-environment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: sessionId,
              globals: { 
                displayMode: mode, 
                viewport: window.__hostState.viewport,
                maxHeight: sizing.maxHeight
              }
            })
          })
          .then(function(res) {
            console.log('[OpenAI Host] Environment update sent for displayMode:', mode, 'status:', res.status);
          })
          .catch(function(err) {
            console.warn('[OpenAI Host] Failed to update environment for displayMode:', err);
          });
        }
        
        // Send response back to widget
        iframe.contentWindow.postMessage({
          type: 'openai:requestDisplayMode:response',
          mode: mode
        }, '*');
      }
      });

      // Listen for openai:set_globals CustomEvents (from requestDisplayMode, etc.)
      // These events are dispatched by the OpenAI host emulator when widget changes environment
      window.addEventListener('openai:set_globals', function(e) {
        var globals = (e.detail && e.detail.globals) ? e.detail.globals : e.detail;
        if (!globals) return;
        
        console.log('[OpenAI Host] Captured set_globals event:', globals);
        
        // Record the event for the dashboard events panel
        recordEvent('globals', globals, 'widget');
        
        // If displayMode or viewport changed, notify inspector to resize Playwright viewport
        if ((globals.displayMode !== undefined || globals.viewport !== undefined) && inspectorUrl) {
          fetch(inspectorUrl + '/update-environment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: sessionId,
              globals: globals
            })
          })
          .then(function(res) {
            console.log('[OpenAI Host] Environment update sent, status:', res.status);
          })
          .catch(function(err) {
            console.warn('[OpenAI Host] Failed to update environment:', err);
          });
        }
      });

      console.log('[OpenAI Host] Ready');
    })();
  </script>
</body>
</html>`;
}

// ============================================================================
// OpenAI Runtime Injection
// ============================================================================

/**
 * Generate OpenAI runtime bootstrap script
 *
 * This script is injected directly into widget HTML to create the window.openai
 * SDK object that OpenAI widgets expect. It provides:
 * - Tool input/output access
 * - Display mode and theme management
 * - Tool calling via postMessage
 * - File upload/download (mock implementation)
 * - Navigation tracking
 * - Error and CSP violation reporting
 * - Storage sync
 * - Inspector sync event handling
 */
export function generateOpenAIRuntimeScript(ctx: OpenAIRuntimeContext): string {
  const { session, toolResultJson, toolNameJson } = ctx;
  const { subjectIdJson, sessionIdJson, localeJson, themeJson, displayModeJson } = ctx;
  const { maxHeightJson, safeAreaJson, userAgentJson, userLocationJson } = ctx;

  return `
<script id="openai-runtime-bootstrap">
(function() {
  // OpenAI Runtime Bootstrap for ${session.toolName}
  const toolOutput = ${toolResultJson};
  const toolName = ${toolNameJson};
  const toolResponseMetadata = { toolName: toolName };

  // Create the window.openai SDK object
  const openaiAPI = {
    toolInput: {},
    toolOutput: toolOutput,
    toolResponseMetadata: toolResponseMetadata,
    displayMode: ${displayModeJson},
    theme: ${themeJson},
    locale: ${localeJson},
    maxHeight: ${maxHeightJson},
    safeArea: ${safeAreaJson},
    userAgent: ${userAgentJson},
    view: { mode: ${displayModeJson}, params: {} },
    widgetState: null,
    widgetSessionId: ${JSON.stringify(session.id)},
    subjectId: ${subjectIdJson},
    sessionId: ${sessionIdJson},
    userLocation: ${userLocationJson},
    _callId: 0,
    _modalId: 0,
    _openInAppUrl: null,
    _uploadedFiles: new Map(),

    setWidgetState(state) {
      this.widgetState = state;
      window.parent.postMessage({ type: 'openai:setWidgetState', state: state }, '*');
    },

    callTool(toolName, args = {}) {
      const callId = ++this._callId;
      return new Promise((resolve, reject) => {
        const handler = (event) => {
          if (event.data?.type === 'openai:callTool:response' && event.data.callId === callId) {
            window.removeEventListener('message', handler);
            event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.result);
          }
        };
        window.addEventListener('message', handler);
        window.parent.postMessage({
          type: 'openai:callTool',
          callId: callId,
          toolName: toolName,
          args: args
        }, '*');
        setTimeout(() => {
          window.removeEventListener('message', handler);
          reject(new Error('Tool call timeout'));
        }, 30000);
      });
    },

    sendFollowUpMessage(opts) {
      const prompt = typeof opts === 'string' ? opts : opts?.prompt || '';
      window.parent.postMessage({ type: 'openai:sendFollowup', message: prompt }, '*');
    },

    requestDisplayMode(options = {}) {
      const mode = options.mode || 'inline';
      const validModes = ['inline', 'fullscreen', 'pip'];
      if (!validModes.includes(mode)) {
        console.warn('[OpenAI Runtime] Invalid display mode:', mode);
      }
      this.displayMode = mode;
      this.view = { ...this.view, mode: mode };
      window.parent.postMessage({ 
        type: 'openai:requestDisplayMode', 
        mode: mode, 
        maxHeight: options.maxHeight,
        pip: options.pip
      }, '*');
      return { mode: mode };
    },

    setOpenInAppUrl(options) {
      const href = typeof options === 'string' ? options : options?.href;
      if (!href) throw new Error('href is required for setOpenInAppUrl');
      this._openInAppUrl = href;
      window.parent.postMessage({ type: 'openai:setOpenInAppUrl', href: href }, '*');
    },

    requestClose() {
      window.parent.postMessage({ type: 'openai:requestClose' }, '*');
    },

    openExternal(options) {
      const href = typeof options === 'string' ? options : options?.href;
      if (!href) throw new Error('href is required for openExternal');
      window.parent.postMessage({ type: 'openai:openExternal', href: href }, '*');
    },

    notifyIntrinsicHeight(height) {
      if (typeof height === 'number' && height > 0) {
        window.parent.postMessage({ type: 'openai:resize', height: Math.round(height) }, '*');
      }
    },

    notifyNavigation(options) {
      const url = options?.url || window.location.href;
      const title = options?.title || document.title;
      window.parent.postMessage({ type: 'openai:navigation', url: url, title: title }, '*');
    },

    requestModal(options = {}) {
      return new Promise((resolve, reject) => {
        const modalId = ++this._modalId;
        const handler = (event) => {
          if (event.data?.type === 'openai:modal:response' && event.data.modalId === modalId) {
            window.removeEventListener('message', handler);
            event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.result);
          }
        };
        window.addEventListener('message', handler);
        window.parent.postMessage({
          type: 'openai:requestModal',
          modalId: modalId,
          params: options.params,
          template: options.template
        }, '*');
        setTimeout(() => {
          window.removeEventListener('message', handler);
          reject(new Error('Modal request timeout'));
        }, 30000);
      });
    },

    uploadFile: async function(file) {
      const fileId = 'file-' + Math.random().toString(36).slice(2, 10);
      // Store file data for later download URL generation
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve) => {
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      this._uploadedFiles.set(fileId, { 
        name: file.name, 
        type: file.type, 
        size: file.size, 
        dataUrl: dataUrl
      });
      return { fileId: fileId };
    },
    
    getFileDownloadUrl: async function(options) {
      const fileId = typeof options === 'string' ? options : options?.fileId;
      const file = this._uploadedFiles.get(fileId);
      if (file) {
        // Return data URL for testing (works in browser)
        return { downloadUrl: file.dataUrl };
      }
      // Return mock URL for unknown files
      return { downloadUrl: 'https://example.com/mock-download/' + fileId };
    },
  };

  // Hook history methods for automatic navigation tracking
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = function(state, title, url) {
    originalPushState(state, title, url);
    openaiAPI.notifyNavigation({ url: url?.toString(), title: title });
  };

  history.replaceState = function(state, title, url) {
    originalReplaceState(state, title, url);
    openaiAPI.notifyNavigation({ url: url?.toString(), title: title });
  };

  window.addEventListener('popstate', () => {
    openaiAPI.notifyNavigation();
  });

  // Enhanced error reporting
  document.addEventListener('securitypolicyviolation', (e) => {
    const violation = {
      blockedURI: e.blockedURI,
      violatedDirective: e.violatedDirective,
      originalPolicy: e.originalPolicy,
      disposition: e.disposition,
      timestamp: Date.now()
    };
    window.parent.postMessage({ type: 'openai:cspViolation', violation: violation }, '*');
    console.error('[CSP Violation]', violation.violatedDirective, violation.blockedURI);
  });

  window.addEventListener('error', (e) => {
    window.parent.postMessage({ 
      type: 'openai:error', 
      error: { message: e.message, filename: e.filename, lineno: e.lineno, colno: e.colno }
    }, '*');
  });

  window.addEventListener('unhandledrejection', (e) => {
    window.parent.postMessage({ 
      type: 'openai:error', 
      error: { message: String(e.reason), type: 'unhandledrejection' }
    }, '*');
  });

  // Storage event sync - sync localStorage changes to host
  window.addEventListener('storage', (e) => {
    if (e.storageArea === localStorage) {
      window.parent.postMessage({
        type: 'openai:storageChange',
        key: e.key,
        oldValue: e.oldValue,
        newValue: e.newValue,
        url: e.url
      }, '*');
    }
  });

  // Listen for storage sync from host
  window.addEventListener('message', (event) => {
    // Only accept messages from parent (security validation)
    if (event.source !== window.parent) return;

    if (event.data?.type === 'openai:syncStorage') {
      const key = event.data.key;
      const value = event.data.value;
      if (value === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, value);
      }
    }

    // Handle inspector sync events (globals, theme, tool data)
    if (event.data?.type === 'openai:inspector_sync') {
      const syncType = event.data.syncType;
      const data = event.data.data;
      console.log('[OpenAI Runtime] Received inspector sync:', syncType, data);

      switch (syncType) {
        case 'globals':
        case 'host-context-changed': {
          // Update window.openai properties
          const g = data || {};
          if (g.theme !== undefined) openaiAPI.theme = g.theme;
          if (g.displayMode !== undefined) openaiAPI.displayMode = g.displayMode;
          if (g.locale !== undefined) openaiAPI.locale = g.locale;
          if (g.maxHeight !== undefined) openaiAPI.maxHeight = g.maxHeight;
          if (g.safeArea !== undefined) openaiAPI.safeArea = g.safeArea;
          if (g.userAgent !== undefined) openaiAPI.userAgent = g.userAgent;
          if (g.userLocation !== undefined) openaiAPI.userLocation = g.userLocation;
          if (g.toolOutput !== undefined) openaiAPI.toolOutput = g.toolOutput;
          if (g.toolInput !== undefined) openaiAPI.toolInput = g.toolInput;
          if (g.toolResponseMetadata !== undefined) openaiAPI.toolResponseMetadata = g.toolResponseMetadata;
          // Dispatch CustomEvent for SDK listeners
          window.dispatchEvent(new CustomEvent('openai:set_globals', {
            detail: { globals: g }
          }));
          break;
        }

        case 'tool-output':
        case 'tool-result':
          openaiAPI.toolOutput = data;
          window.dispatchEvent(new CustomEvent('openai:set_globals', {
            detail: { globals: { toolOutput: data } }
          }));
          break;

        case 'tool-input':
          openaiAPI.toolInput = data;
          window.dispatchEvent(new CustomEvent('openai:set_globals', {
            detail: { globals: { toolInput: data } }
          }));
          break;

        case 'tool-input-partial': {
          // Merge partial input with existing
          const existing = openaiAPI.toolInput || {};
          openaiAPI.toolInput = { ...existing, ...data };
          window.dispatchEvent(new CustomEvent('openai:set_globals', {
            detail: { globals: { toolInput: data } }
          }));
          break;
        }

        case 'tool-response-metadata':
          openaiAPI.toolResponseMetadata = data;
          break;

        case 'call-tool-response':
          // Re-dispatch as the expected message type
          window.postMessage({
            type: 'openai:callTool:response',
            ...data
          }, '*');
          break;

        case 'tool-cancelled':
          window.dispatchEvent(new CustomEvent('openai:tool_cancelled'));
          break;
      }
    }
  });

  // Define window.openai as non-writable
  Object.defineProperty(window, 'openai', {
    value: openaiAPI,
    writable: false,
    configurable: false,
    enumerable: true
  });

  // Dispatch openai:set_globals event
  setTimeout(() => {
    try {
      window.dispatchEvent(new CustomEvent('openai:set_globals', {
        detail: {
          globals: {
            displayMode: openaiAPI.displayMode,
            maxHeight: openaiAPI.maxHeight,
            theme: openaiAPI.theme,
            locale: openaiAPI.locale,
            safeArea: openaiAPI.safeArea,
            userAgent: openaiAPI.userAgent,
            userLocation: openaiAPI.userLocation,
            toolOutput: toolOutput,
            toolResponseMetadata: toolResponseMetadata
          }
        }
      }));
    } catch (err) {
      console.error('[OpenAI Runtime] Failed to dispatch globals event:', err);
    }
  }, 0);

  // Auto-resize with ResizeObserver
  try {
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
        if (height > 0) {
          openaiAPI.notifyIntrinsicHeight(height);
        }
      }
    });
    
    if (document.body) {
      resizeObserver.observe(document.body);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        resizeObserver.observe(document.body);
      });
    }
  } catch (err) {
    console.warn('[OpenAI Runtime] ResizeObserver not available:', err);
  }

  console.log('[OpenAI Runtime] Initialized for tool:', toolName);
})();
</script>
`;
}

/**
 * Inject OpenAI runtime script into widget HTML
 *
 * Inserts the runtime bootstrap script in the most appropriate location:
 * 1. Before </head> (preferred - script runs early)
 * 2. After <body> tag (fallback)
 * 3. At start of document (last resort)
 */
export function injectOpenAIRuntime(html: string, runtimeScript: string): string {
  // Priority: After <head>, or at start of <body>, or at start of document
  if (html.includes("</head>")) {
    return html.replace("</head>", `${runtimeScript}\n</head>`);
  } else if (html.includes("<body")) {
    return html.replace(/<body([^>]*)>/, `<body$1>\n${runtimeScript}`);
  } else {
    // Fallback: prepend to the HTML
    return runtimeScript + "\n" + html;
  }
}
