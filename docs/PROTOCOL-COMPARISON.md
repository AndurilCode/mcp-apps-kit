# Protocol Comparison: MCP Apps vs ChatGPT Apps

This document provides a detailed comparison of the two protocols that the unified framework abstracts over.

## Overview

| Aspect | MCP Apps (SEP-1865) | ChatGPT Apps (OpenAI SDK) |
|--------|---------------------|---------------------------|
| **Spec Status** | Draft (SEP-1865) | Production |
| **Primary Host** | Claude Desktop | ChatGPT |
| **Extension ID** | `io.modelcontextprotocol/ui` | N/A (built-in) |
| **MIME Type** | `text/html;profile=mcp-app` | `text/html+skybridge` |
| **UI SDK** | `@modelcontextprotocol/ext-apps` | `window.openai` (injected) |
| **Communication** | JSON-RPC 2.0 via postMessage | Custom API via injected global |

## Tool Metadata Mapping

### Tool Definition

| Field | MCP Apps | ChatGPT Apps |
|-------|----------|--------------|
| UI Resource Link | `_meta.ui.resourceUri` | `_meta["openai/outputTemplate"]` |
| Visibility | `_meta.ui.visibility` | `_meta["openai/visibility"]` |
| App-Callable | Implicit (via visibility) | `_meta["openai/widgetAccessible"]` |
| Loading Message | N/A | `_meta["openai/toolInvocation/invoking"]` |
| Complete Message | N/A | `_meta["openai/toolInvocation/invoked"]` |
| File Parameters | N/A | `_meta["openai/fileParams"]` |

### Visibility Values

| Intent | MCP Apps | ChatGPT Apps |
|--------|----------|--------------|
| Model + UI | `["model", "app"]` | `"public"` + `widgetAccessible: true` |
| Model Only | `["model"]` | `"public"` + `widgetAccessible: false` |
| UI Only | `["app"]` | `"private"` + `widgetAccessible: true` |

### Unified Mapping

```typescript
// Unified visibility enum
type Visibility = "model" | "app" | "both";

// Mapping to MCP Apps
function toMcpVisibility(v: Visibility): string[] {
  switch (v) {
    case "model": return ["model"];
    case "app": return ["app"];
    case "both": return ["model", "app"];
  }
}

// Mapping to ChatGPT Apps
function toOpenAIVisibility(v: Visibility): { visibility: string; widgetAccessible: boolean } {
  switch (v) {
    case "model": return { visibility: "public", widgetAccessible: false };
    case "app": return { visibility: "private", widgetAccessible: true };
    case "both": return { visibility: "public", widgetAccessible: true };
  }
}
```

## Resource Metadata Mapping

### UI Resource Definition

| Field | MCP Apps | ChatGPT Apps |
|-------|----------|--------------|
| Connect Domains (APIs) | `_meta.ui.csp.connectDomains` | `_meta["openai/widgetCSP"].connect_domains` |
| Resource Domains (CDNs) | `_meta.ui.csp.resourceDomains` | `_meta["openai/widgetCSP"].resource_domains` |
| Redirect Domains | N/A | `_meta["openai/widgetCSP"].redirect_domains` |
| Frame Domains | N/A | `_meta["openai/widgetCSP"].frame_domains` |
| Dedicated Domain | `_meta.ui.domain` | `_meta["openai/widgetDomain"]` |
| Border Preference | `_meta.ui.prefersBorder` | `_meta["openai/widgetPrefersBorder"]` |

### Unified CSP Config

```typescript
interface UnifiedCSP {
  // Domains for fetch/XHR/WebSocket
  connectDomains?: string[];

  // Domains for images, scripts, stylesheets, fonts
  resourceDomains?: string[];

  // ChatGPT-specific: Domains for openExternal without modal
  redirectDomains?: string[];

  // ChatGPT-specific: Allowed iframe origins (discouraged)
  frameDomains?: string[];
}

// Mapping to MCP Apps
function toMcpCSP(csp: UnifiedCSP): McpCSP {
  return {
    connectDomains: csp.connectDomains,
    resourceDomains: csp.resourceDomains,
    // redirectDomains and frameDomains are ignored (not supported)
  };
}

// Mapping to ChatGPT Apps
function toOpenAICSP(csp: UnifiedCSP): OpenAICSP {
  return {
    connect_domains: csp.connectDomains,
    resource_domains: csp.resourceDomains,
    redirect_domains: csp.redirectDomains,
    frame_domains: csp.frameDomains,
  };
}
```

## Tool Response Mapping

### Response Fields

| Field | MCP Apps | ChatGPT Apps |
|-------|----------|--------------|
| Text Content | `content: [{ type: "text", text: "..." }]` | `content: [{ type: "text", text: "..." }]` |
| Structured Data | `structuredContent: { ... }` | `structuredContent: { ... }` |
| UI Metadata | `_meta: { ... }` | `_meta: { ... }` |
| Close Widget | N/A | `_meta["openai/closeWidget"]: true` |

### Unified Response

```typescript
interface ToolResponse<T> {
  // Main output data (sent to model)
  data: T;

  // Text narration for model (optional)
  text?: string;

  // UI-only metadata (not sent to model)
  _meta?: {
    // Any additional data for UI
    [key: string]: unknown;

    // ChatGPT-specific: close widget after response
    closeWidget?: boolean;
  };
}

// Mapping to protocol format
function toMcpResponse(response: ToolResponse<T>): McpToolResult {
  return {
    content: response.text
      ? [{ type: "text", text: response.text }]
      : [{ type: "text", text: JSON.stringify(response.data) }],
    structuredContent: response.data,
    _meta: response._meta,
  };
}

function toOpenAIResponse(response: ToolResponse<T>): OpenAIToolResult {
  const meta = { ...response._meta };
  if (meta.closeWidget) {
    meta["openai/closeWidget"] = true;
    delete meta.closeWidget;
  }

  return {
    content: response.text
      ? [{ type: "text", text: response.text }]
      : [{ type: "text", text: JSON.stringify(response.data) }],
    structuredContent: response.data,
    _meta: meta,
  };
}
```

## UI Client API Mapping

### Initialization

| Operation | MCP Apps | ChatGPT Apps |
|-----------|----------|--------------|
| Get Client | `new App({ name, version })` | `window.openai` (auto-injected) |
| Connect | `app.connect(new PostMessageTransport(window.parent))` | N/A (already connected) |
| Initialize Event | `app.oninitialized = (result) => { ... }` | N/A (data immediately available) |

### Data Access

| Data | MCP Apps | ChatGPT Apps |
|------|----------|--------------|
| Tool Input Args | `app.ontoolinput` event | `window.openai.toolInput` |
| Tool Output Data | `result.structuredContent` (via event) | `window.openai.toolOutput` |
| UI-Only Metadata | `result._meta` (via event) | `window.openai.toolResponseMetadata` |
| Persisted State | N/A (manual) | `window.openai.widgetState` |

### Actions

| Action | MCP Apps | ChatGPT Apps |
|--------|----------|--------------|
| Call Tool | `app.callServerTool({ name, arguments })` | `window.openai.callTool(name, args)` |
| Send Message | `app.sendMessage({ role, content })` | `window.openai.sendFollowUpMessage({ prompt })` |
| Open Link | `app.sendOpenLink({ url })` | `window.openai.openExternal({ href })` |
| Request Display Mode | `app.requestDisplayMode(mode)` | `window.openai.requestDisplayMode({ mode })` |
| Report Height | N/A | `window.openai.notifyIntrinsicHeight(height)` |
| Close Widget | N/A | `window.openai.requestClose()` |
| Request Modal | N/A | `window.openai.requestModal({ title, component })` |
| Upload File | N/A | `window.openai.uploadFile(file)` |
| Get File URL | N/A | `window.openai.getFileDownloadUrl({ fileId })` |
| Set State | N/A | `window.openai.setWidgetState(state)` |
| Read Resource | `app.readResource({ uri })` | N/A |
| Send Log | `app.sendLog({ level, data })` | `console.log()` |

### Context

| Context | MCP Apps | ChatGPT Apps |
|---------|----------|--------------|
| Theme | `hostContext.theme` | `window.openai.theme` |
| Display Mode | `hostContext.displayMode` | `window.openai.displayMode` |
| Locale | `hostContext.locale` | `window.openai.locale` |
| Viewport | `hostContext.viewport` | `{ width, height, maxHeight: window.openai.maxHeight }` |
| Safe Area | `hostContext.safeAreaInsets` | `window.openai.safeArea` |
| Platform | `hostContext.platform` | Derive from `window.openai.userAgent` |
| User Agent | `hostContext.userAgent` | `window.openai.userAgent` |
| CSS Variables | `hostContext.styles.variables` | Injected into document |
| Fonts | `hostContext.styles.css.fonts` | Injected into document |

### Events

| Event | MCP Apps | ChatGPT Apps |
|-------|----------|--------------|
| Tool Input | `app.ontoolinput` | Initial `window.openai.toolInput` |
| Tool Result | `app.ontoolresult` | `window.addEventListener("openai:set_globals", ...)` |
| Tool Cancelled | `app.ontoolcancelled` | N/A |
| Context Change | `app.onhostcontextchange` | `window.addEventListener("openai:set_globals", ...)` |
| Teardown | `app.onteardown` | N/A |
| Partial Input | `app.ontoolinputpartial` | N/A |

## Unified Client Implementation

```typescript
class UnifiedClient<T extends ToolDefs> implements AppsClient<T> {
  private adapter: ProtocolAdapter;

  constructor() {
    this.adapter = detectProtocol();
  }

  async connect(): Promise<void> {
    await this.adapter.connect();
  }

  // Tool operations
  async callTool<K extends keyof T>(
    name: K,
    args: ToolInputs<T>[K]
  ): Promise<ToolOutputs<T>[K]> {
    return this.adapter.callTool(String(name), args);
  }

  // Messaging
  async sendMessage(content: { type: "text"; text: string }): Promise<void> {
    return this.adapter.sendMessage(content);
  }

  async sendFollowUpMessage(prompt: string): Promise<void> {
    return this.sendMessage({ type: "text", text: prompt });
  }

  // Navigation
  async openLink(url: string): Promise<void> {
    return this.adapter.openLink(url);
  }

  async requestDisplayMode(mode: DisplayMode): Promise<{ mode: string }> {
    return this.adapter.requestDisplayMode(mode);
  }

  requestClose(): void {
    this.adapter.requestClose();
  }

  // State
  getState<S>(): S | null {
    return this.adapter.getState();
  }

  setState<S>(state: S): void {
    this.adapter.setState(state);
  }

  // Files
  async uploadFile(file: File): Promise<{ fileId: string }> {
    if (!this.adapter.uploadFile) {
      throw new Error("File upload not supported on this platform");
    }
    return this.adapter.uploadFile(file);
  }

  async getFileDownloadUrl(fileId: string): Promise<{ downloadUrl: string }> {
    if (!this.adapter.getFileDownloadUrl) {
      throw new Error("File download not supported on this platform");
    }
    return this.adapter.getFileDownloadUrl(fileId);
  }

  // Resources
  async readResource(uri: string): Promise<ResourceReadResult> {
    return this.adapter.readResource(uri);
  }

  // Logging
  log(level: LogLevel, data: unknown): void {
    this.adapter.log(level, data);
  }

  // Events
  onToolResult(handler: (result: ToolResult<T>) => void): () => void {
    return this.adapter.onToolResult(handler);
  }

  onToolInput(handler: (input: ToolInput) => void): () => void {
    return this.adapter.onToolInput(handler);
  }

  onToolCancelled(handler: (reason?: string) => void): () => void {
    return this.adapter.onToolCancelled(handler);
  }

  onHostContextChange(handler: (context: HostContext) => void): () => void {
    return this.adapter.onHostContextChange(handler);
  }

  onTeardown(handler: (reason?: string) => void): () => void {
    return this.adapter.onTeardown(handler);
  }

  // Current state
  get hostContext(): HostContext {
    return this.adapter.getHostContext();
  }

  get toolInput(): Record<string, unknown> | undefined {
    return this.adapter.getToolInput();
  }

  get toolOutput(): Record<string, unknown> | undefined {
    return this.adapter.getToolOutput();
  }

  get toolMeta(): Record<string, unknown> | undefined {
    return this.adapter.getToolMeta();
  }
}
```

## Feature Support Matrix

| Feature | MCP Apps | ChatGPT Apps | Unified |
|---------|----------|--------------|---------|
| Tool Calling | ✅ | ✅ | ✅ |
| Structured Data | ✅ | ✅ | ✅ |
| UI Metadata | ✅ | ✅ | ✅ |
| Theme Support | ✅ | ✅ | ✅ |
| Display Modes | ✅ | ✅ | ✅ |
| Send Message | ✅ | ✅ | ✅ |
| Open Link | ✅ | ✅ | ✅ |
| Tool Visibility | ✅ | ✅ | ✅ |
| CSP Configuration | ✅ | ✅ | ✅ |
| Persisted State | ❌ | ✅ | ✅ (polyfill) |
| File Upload | ❌ | ✅ | ⚠️ (platform-dependent) |
| File Download | ❌ | ✅ | ⚠️ (platform-dependent) |
| Report Height | ❌ | ✅ | ⚠️ (platform-dependent) |
| Request Modal | ❌ | ✅ | ⚠️ (platform-dependent) |
| Close Widget | ❌ | ✅ | ⚠️ (platform-dependent) |
| Read Resource | ✅ | ❌ | ⚠️ (platform-dependent) |
| Tool Cancellation | ✅ | ❌ | ⚠️ (platform-dependent) |
| Partial Updates | ✅ | ❌ | ⚠️ (platform-dependent) |
| Teardown Event | ✅ | ❌ | ⚠️ (platform-dependent) |
| Redirect Domains | ❌ | ✅ | ⚠️ (ChatGPT only) |
| Frame Domains | ❌ | ✅ | ⚠️ (ChatGPT only) |

## State Management Strategy

### MCP Apps: Manual State

MCP Apps doesn't have built-in state persistence. The unified framework provides a polyfill:

```typescript
class McpAppsAdapter {
  private state: Record<string, unknown> | null = null;

  getState<S>(): S | null {
    return this.state as S;
  }

  setState<S>(state: S): void {
    this.state = state;
    // Optionally persist via tool call or localStorage
  }

  // Rehydrate state from tool result _meta
  private handleToolResult(result: ToolResult): void {
    if (result._meta?.previousState) {
      this.state = result._meta.previousState;
    }
  }
}
```

### ChatGPT Apps: Built-in State

ChatGPT Apps has native state persistence:

```typescript
class ChatGptAppsAdapter {
  getState<S>(): S | null {
    return window.openai.widgetState as S;
  }

  setState<S>(state: S): void {
    window.openai.setWidgetState(state);
  }
}
```

### Unified React Hook

```typescript
function useWidgetState<S>(defaultValue: S): [S, (newState: S | ((prev: S) => S)) => void] {
  const client = useAppsClient();
  const [state, setStateInternal] = useState<S>(() => {
    return client.getState<S>() ?? defaultValue;
  });

  const setState = useCallback((newState: S | ((prev: S) => S)) => {
    setStateInternal((prev) => {
      const updated = typeof newState === "function"
        ? (newState as (prev: S) => S)(prev)
        : newState;
      client.setState(updated);
      return updated;
    });
  }, [client]);

  // Sync with external changes
  useEffect(() => {
    return client.onHostContextChange(() => {
      const externalState = client.getState<S>();
      if (externalState !== null) {
        setStateInternal(externalState);
      }
    });
  }, [client]);

  return [state, setState];
}
```

## CSS Variable Strategy

Both protocols support CSS variables for theming, but with different delivery mechanisms.

### MCP Apps

Variables delivered via `hostContext.styles.variables`:

```typescript
app.onhostcontextchange = (context) => {
  if (context.styles?.variables) {
    for (const [key, value] of Object.entries(context.styles.variables)) {
      document.documentElement.style.setProperty(key, value);
    }
  }
};
```

### ChatGPT Apps

Variables injected automatically by ChatGPT host.

### Unified Approach

The framework ensures consistent variable application:

```typescript
// React hook
function useHostStyleVariables(): void {
  const context = useHostContext();

  useEffect(() => {
    // Apply MCP-style variables if present
    if (context.styles?.variables) {
      for (const [key, value] of Object.entries(context.styles.variables)) {
        document.documentElement.style.setProperty(key, value);
      }
    }
    // ChatGPT variables are auto-injected, no action needed
  }, [context.styles]);
}

// Always define fallbacks in CSS
// :root {
//   --color-background-primary: light-dark(#ffffff, #171717);
//   --color-text-primary: light-dark(#171717, #fafafa);
// }
```

## Authentication Differences

### MCP Apps

No standardized auth in base MCP. Auth typically handled at transport level.

### ChatGPT Apps

OAuth 2.1 with PKCE and dynamic client registration:

```typescript
// Protected resource metadata
// /.well-known/oauth-protected-resource
{
  "resource": "https://your-mcp.example.com",
  "authorization_servers": ["https://auth.example.com"],
  "scopes_supported": ["read", "write"]
}

// Tool security schemes
server.registerTool("protected_tool", {
  securitySchemes: [{ type: "oauth2", scopes: ["read"] }],
  // ...
});
```

### Unified Approach

The framework supports both patterns:

```typescript
const app = createApp({
  // ...
  config: {
    auth: {
      // OAuth 2.1 config (primarily for ChatGPT)
      type: "oauth2",
      protectedResource: "https://api.example.com",
      authorizationServer: "https://auth.example.com",
      scopes: ["read", "write"],
    },
  },
});
```

When generating tool metadata:
- For ChatGPT: Include `securitySchemes` in tool definition
- For MCP: Leave auth to transport-level handling

## Error Handling

### MCP Apps

Errors thrown from tool handlers become MCP error responses:

```typescript
throw new Error("Something went wrong");
// Results in: { content: [{ type: "text", text: "Error: Something went wrong" }], isError: true }
```

### ChatGPT Apps

Similar pattern with additional metadata options:

```typescript
return {
  content: [{ type: "text", text: "Error message" }],
  _meta: {
    "mcp/www_authenticate": [...], // OAuth challenge
  },
  isError: true,
};
```

### Unified Error Handling

```typescript
// In tool handler
handler: async (input) => {
  try {
    return await processInput(input);
  } catch (error) {
    throw new AppError({
      message: error.message,
      code: "PROCESSING_ERROR",
      // ChatGPT-specific: trigger OAuth flow
      authChallenge: error instanceof AuthError
        ? { scopes: ["read"] }
        : undefined,
    });
  }
}
```
