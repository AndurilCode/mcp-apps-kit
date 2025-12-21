# MCP Apps Specification (SEP-1865) - Key Excerpts

This document contains key excerpts from the MCP Apps specification (SEP-1865). For the complete specification, see: https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx

## Extension Identifier

`io.modelcontextprotocol/ui`

## Overview

MCP Apps extends the Model Context Protocol to enable servers to deliver interactive user interfaces to hosts. This extension introduces:

- **UI Resources:** Predeclared resources using the `ui://` URI scheme
- **Tool-UI Linkage:** Tools reference UI resources via metadata
- **Bidirectional Communication:** UI iframes communicate with hosts using standard MCP JSON-RPC protocol
- **Security Model:** Mandatory iframe sandboxing with auditable communication

## UI Resource Format

UI resources are declared using the standard MCP resource pattern:

```typescript
interface UIResource {
  uri: string;                      // Must use ui:// scheme
  name: string;                     // Human-readable name
  description?: string;             // Optional description
  mimeType: string;                 // "text/html;profile=mcp-app"
  _meta?: {
    ui?: UIResourceMeta;
  }
}

interface UIResourceMeta {
  csp?: {
    connectDomains?: string[];      // For fetch/XHR/WebSocket
    resourceDomains?: string[];     // For images, scripts, etc.
  };
  domain?: string;                  // Dedicated origin for widget
  prefersBorder?: boolean;          // Request visible border/background
}
```

## Tool-UI Linkage

Tools reference UI resources via `_meta.ui`:

```typescript
interface McpUiToolMeta {
  resourceUri?: string;             // URI of UI resource
  visibility?: Array<"model" | "app">; // Default: ["model", "app"]
}

interface Tool {
  name: string;
  description: string;
  inputSchema: object;
  _meta?: {
    ui?: McpUiToolMeta;
  };
}
```

## Visibility Control

- `["model", "app"]` (default): Tool visible to agent and callable by app
- `["app"]`: Hidden from agent, only callable by app (UI-only interactions)
- `["model"]`: Visible to agent only, not callable by app

## Communication Protocol

MCP Apps uses JSON-RPC 2.0 over `postMessage` for iframe-host communication.

### Standard MCP Messages

UI iframes can use:

- `tools/call` - Execute a tool on the MCP server
- `resources/read` - Read resource content
- `notifications/message` - Log messages to host
- `ui/initialize` → `ui/notifications/initialized` - Handshake
- `ping` - Connection health check

### MCP Apps Specific Messages

#### Requests (UI → Host)

**`ui/open-link`** - Request host to open external URL

```typescript
{
  jsonrpc: "2.0",
  id: 1,
  method: "ui/open-link",
  params: { url: string }
}
```

**`ui/message`** - Send message content to chat

```typescript
{
  jsonrpc: "2.0",
  id: 2,
  method: "ui/message",
  params: {
    role: "user",
    content: { type: "text", text: string }
  }
}
```

**`ui/request-display-mode`** - Request display mode change

```typescript
{
  jsonrpc: "2.0",
  id: 3,
  method: "ui/request-display-mode",
  params: { mode: "inline" | "fullscreen" | "pip" }
}
```

#### Notifications (Host → UI)

**`ui/notifications/initialized`** - Handshake complete

```typescript
{
  jsonrpc: "2.0",
  method: "ui/notifications/initialized",
  params: {
    protocolVersion: string;
    hostCapabilities: object;
    hostInfo: { name: string; version: string };
    hostContext: McpUiHostContext;
  }
}
```

**`ui/notifications/tool-input`** - Tool execution started

```typescript
{
  jsonrpc: "2.0",
  method: "ui/notifications/tool-input",
  params: {
    name: string;
    arguments: object;
  }
}
```

**`ui/notifications/tool-result`** - Tool execution complete

```typescript
{
  jsonrpc: "2.0",
  method: "ui/notifications/tool-result",
  params: {
    content: ContentBlock[];
    structuredContent?: any;
    _meta?: object;
  }
}
```

**`ui/notifications/tool-cancelled`** - Tool execution cancelled

**`ui/notifications/host-context-changed`** - Host context updated

**`ui/resource-teardown`** - UI about to be torn down

## Host Context

Host provides context information via `McpUiHostContext`:

```typescript
interface McpUiHostContext {
  theme?: "light" | "dark";
  styles?: {
    variables?: Record<string, string>;  // CSS variables
    css?: {
      fonts?: string;                    // Font @import
    };
  };
  displayMode?: "inline" | "fullscreen" | "pip";
  availableDisplayModes?: string[];
  viewport?: {
    width: number;
    height: number;
    maxHeight?: number;
    maxWidth?: number;
  };
  locale?: string;                       // BCP 47 (e.g., "en-US")
  timeZone?: string;                     // IANA (e.g., "America/New_York")
  userAgent?: string;
  platform?: "web" | "desktop" | "mobile";
  deviceCapabilities?: {
    touch?: boolean;
    hover?: boolean;
  };
  safeAreaInsets?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}
```

## Data Passing

Three ways to pass data to UI:

1. **Initial tool result** (via `ui/notifications/tool-result`):
   - `content`: Text for agent context
   - `structuredContent`: Structured data for UI
   - `_meta`: Additional metadata

2. **Interactive tool calls** (from UI via `tools/call`):
   - UI requests fresh data by calling tools
   - Results returned via standard `CallToolResult`

3. **Resource reads** (from UI via `resources/read`):
   - UI reads static resources (config, templates, etc.)

## Capability Negotiation

### Client (Host) Capabilities

Clients advertise MCP Apps support:

```json
{
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "extensions": {
        "io.modelcontextprotocol/ui": {
          "mimeTypes": ["text/html;profile=mcp-app"]
        }
      }
    }
  }
}
```

### Server Behavior

- Servers SHOULD check for `extensions["io.modelcontextprotocol/ui"]` capability
- Tools MUST return meaningful content array even when UI is available
- Servers MAY register different tool variants based on host capabilities

## Security Model

### Iframe Sandboxing

Host MUST render UI resources in sandboxed iframes with:

```html
<iframe
  sandbox="allow-scripts allow-same-origin allow-forms"
  csp="default-src 'none'; script-src 'self' 'unsafe-inline'; ..."
/>
```

### CSP Enforcement

- Host MUST construct CSP headers based on declared domains
- If `ui.csp` is omitted, Host MUST use restrictive default
- Host MAY further restrict but MUST NOT allow undeclared domains

**Default CSP:**
```
default-src 'none';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
media-src 'self' data:;
connect-src 'none';
```

### Auditable Communication

- All UI-host communication via JSON-RPC over postMessage
- No direct network access without CSP declaration
- Host can log/audit all UI actions

## Lifecycle

1. **Connection & Discovery**
   - Server lists resources (includes `ui://` resources)
   - Server lists tools (includes tools with `_meta.ui` metadata)

2. **UI Initialization**
   - Host renders UI in iframe
   - UI sends `ui/initialize`
   - Host responds with `ui/notifications/initialized` (includes host context)

3. **Interactive Phase**
   - User/agent interacts with UI
   - UI calls tools via `tools/call`
   - Host sends tool updates via `ui/notifications/tool-*`
   - UI sends messages/notifications

4. **Cleanup**
   - Host sends `ui/resource-teardown`
   - UI performs cleanup
   - Host tears down iframe

## Best Practices

### Server Side

- Always provide meaningful `content` array for text-only fallback
- Use `structuredContent` for UI-optimized data
- Declare all external domains in CSP
- Test with hosts that don't support UI

### UI Side

- Define fallback CSS variables in `:root`
- Use `applyHostStyleVariables` for theming
- Handle tool cancellation gracefully
- Provide loading states for async operations
- Validate all user inputs before sending to server

### Security

- Never store sensitive credentials in UI code
- Use HTTPS for all external resources
- Follow principle of least privilege for CSP
- Test with restrictive CSP during development

## Limitations (MVP)

- Only `text/html;profile=mcp-app` content type supported
- No direct external URL embedding
- No widget-to-widget communication
- No state persistence between sessions
- Single UI resource per tool result

## Future Extensions (Deferred)

- External URL content type (`text/uri-list`)
- Multiple UI resources per tool
- State persistence APIs
- Custom sandbox policies
- Screenshot/preview generation
- Remote DOM support
