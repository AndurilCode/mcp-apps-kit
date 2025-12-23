# API Reference

Complete API reference for the Unified MCP Apps Builder Framework.

## Table of Contents

1. [Server API (`@mcp-apps-kit/core`)](#server-api)
2. [Client API (`@mcp-apps-kit/ui`)](#client-api)
3. [React Bindings (`@mcp-apps-kit/ui-react`)](#react-bindings)
4. [Type Definitions](#type-definitions)

---

## Server API

### `createApp(config)`

Creates a unified MCP app with tools, UI resources, and configuration.

```typescript
import { createApp } from "@mcp-apps-kit/core";

const app = createApp(config: AppConfig): App;
```

#### `AppConfig`

```typescript
interface AppConfig {
  /**
   * Application name (used in MCP server identification)
   */
  name: string;

  /**
   * Semantic version string
   */
  version: string;

  /**
   * Tool definitions
   */
  tools: ToolDefs;

  /**
   * UI resource definitions
   */
  ui: UIDefs;

  /**
   * Global configuration options
   */
  config?: {
    /**
     * Authentication configuration
     */
    auth?: AuthConfig;

    /**
     * Default tool visibility
     * @default "both"
     */
    defaultVisibility?: Visibility;

    /**
     * Enable debug logging
     * @default false
     */
    debug?: boolean;
  };
}
```

#### `ToolDefs`

```typescript
type ToolDefs = Record<string, ToolDef<z.ZodType, z.ZodType>>;

interface ToolDef<TInput extends z.ZodType, TOutput extends z.ZodType> {
  /**
   * Human-readable tool title
   */
  title?: string;

  /**
   * Tool description (shown to model)
   */
  description: string;

  /**
   * Zod schema for input validation
   */
  input: TInput;

  /**
   * Zod schema for output validation (optional)
   */
  output?: TOutput;

  /**
   * Async handler function
   */
  handler: (input: z.infer<TInput>, context: HandlerContext) => Promise<
    z.infer<TOutput> & {
      /**
       * Text narration for the model (optional)
       */
      _text?: string;

      /**
       * UI-only metadata (not sent to model)
       */
      _meta?: Record<string, unknown>;
    }
  >;

  /**
   * UI resource ID to render for this tool
   */
  ui?: string;

  /**
   * Tool visibility control
   * - "model": Only visible to agent
   * - "app": Only callable from UI
   * - "both": Visible to agent and callable from UI
   * @default "both"
   */
  visibility?: Visibility;

  /**
   * Status message shown while tool is executing (ChatGPT only)
   */
  invokingMessage?: string;

  /**
   * Status message shown when tool completes (ChatGPT only)
   */
  invokedMessage?: string;

  /**
   * Fields that contain file references (ChatGPT only)
   */
  fileParams?: string[];

  /**
   * Required OAuth scopes (ChatGPT only)
   */
  scopes?: string[];
}
```

#### `UIDefs`

```typescript
type UIDefs = Record<string, UIDef>;

interface UIDef {
  /**
   * HTML content or path to HTML file
   * If starts with "./" or "/", treated as file path
   */
  html: string;

  /**
   * Human-readable name
   */
  name?: string;

  /**
   * Description of the UI resource
   */
  description?: string;

  /**
   * Content Security Policy configuration
   */
  csp?: CSPConfig;

  /**
   * Dedicated domain for this widget
   */
  domain?: string;

  /**
   * Request visible border around widget
   * @default false
   */
  prefersBorder?: boolean;
}

interface CSPConfig {
  /**
   * Domains allowed for fetch/XHR/WebSocket
   */
  connectDomains?: string[];

  /**
   * Domains allowed for images, scripts, stylesheets, fonts
   */
  resourceDomains?: string[];

  /**
   * Domains for openExternal without safe-link modal (ChatGPT only)
   */
  redirectDomains?: string[];

  /**
   * Allowed iframe origins (ChatGPT only, discouraged)
   */
  frameDomains?: string[];
}
```

#### `AuthConfig`

```typescript
interface AuthConfig {
  /**
   * Authentication type
   */
  type: "oauth2" | "none";

  /**
   * Protected resource URL (OAuth 2.1)
   */
  protectedResource?: string;

  /**
   * Authorization server URL (OAuth 2.1)
   */
  authorizationServer?: string;

  /**
   * Required OAuth scopes
   */
  scopes?: string[];
}
```

#### `HandlerContext`

```typescript
interface HandlerContext {
  /**
   * Authorization header value (if present)
   */
  authorization?: string;

  /**
   * Request metadata
   */
  meta?: Record<string, unknown>;

  /**
   * Abort signal for cancellation
   */
  signal?: AbortSignal;
}
```

### `App` Instance

#### `app.start(options)`

Starts the MCP server with Express.

```typescript
await app.start(options: StartOptions): Promise<void>;

interface StartOptions {
  /**
   * Port to listen on
   * @default 3000
   */
  port?: number;

  /**
   * Transport type
   * - "http": HTTP server with SSE
   * - "stdio": Standard I/O (for CLI tools)
   * @default "http"
   */
  transport?: "http" | "stdio";

  /**
   * CORS configuration
   */
  cors?: {
    origin?: string | string[];
    credentials?: boolean;
  };

  /**
   * Callback when server starts
   */
  onStart?: (port: number) => void;
}
```

#### `app.getServer()`

Returns the underlying MCP server instance for custom transport setup.

```typescript
const mcpServer = app.getServer(): McpServer;
```

#### `app.handler()`

Returns Express middleware for custom Express integration.

```typescript
import express from "express";

const expressApp = express();
expressApp.use("/mcp", app.handler());
```

#### `app.handleRequest(req, res)`

Handles a single request (for serverless environments).

```typescript
// Cloudflare Workers
export default {
  async fetch(request: Request) {
    return app.handleRequest(request);
  }
};

// Vercel
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return app.handleRequest(req, res);
}
```

---

## Client API

### `createClient()`

Creates a unified client for communicating with the host.

```typescript
import { createClient } from "@mcp-apps-kit/ui";

const client = await createClient<AppTools>(options?: ClientOptions): Promise<AppsClient<AppTools>>;

interface ClientOptions {
  /**
   * Force specific protocol (for testing)
   */
  protocol?: "mcp" | "openai" | "mock";

  /**
   * App name for MCP handshake
   */
  name?: string;

  /**
   * App version for MCP handshake
   */
  version?: string;
}
```

### `AppsClient<T>`

The unified client interface.

#### Tool Operations

```typescript
interface AppsClient<T extends ToolDefs> {
  /**
   * Call a tool on the server
   * @param name - Tool name (type-checked)
   * @param args - Tool arguments (type-checked)
   * @returns Tool result (type-checked)
   */
  callTool<K extends keyof T>(
    name: K,
    args: ToolInputs<T>[K]
  ): Promise<ToolOutputs<T>[K]>;
}
```

#### Messaging

```typescript
interface AppsClient<T> {
  /**
   * Send a message to the conversation
   */
  sendMessage(content: MessageContent): Promise<void>;

  /**
   * Send a follow-up message (ChatGPT-style shorthand)
   */
  sendFollowUpMessage(prompt: string): Promise<void>;

  /**
   * Log a message to the host
   */
  log(level: LogLevel, data: unknown): void;
}

type MessageContent = {
  type: "text";
  text: string;
};

type LogLevel = "debug" | "info" | "warning" | "error";
```

#### Navigation

```typescript
interface AppsClient<T> {
  /**
   * Open an external link in the user's browser
   */
  openLink(url: string): Promise<void>;

  /**
   * Request a display mode change
   */
  requestDisplayMode(mode: DisplayMode): Promise<{ mode: string }>;

  /**
   * Request to close the widget (ChatGPT only)
   */
  requestClose(): void;

  /**
   * Request a modal overlay (ChatGPT only)
   */
  requestModal?(options: ModalOptions): Promise<void>;
}

type DisplayMode = "inline" | "fullscreen" | "pip";

interface ModalOptions {
  title?: string;
  component?: string;
}
```

#### State Management

```typescript
interface AppsClient<T> {
  /**
   * Get persisted widget state
   */
  getState<S>(): S | null;

  /**
   * Set widget state (persisted across renders)
   */
  setState<S>(state: S): void;
}
```

#### File Operations (ChatGPT only)

```typescript
interface AppsClient<T> {
  /**
   * Upload a file
   * @throws Error if not supported on current platform
   */
  uploadFile?(file: File): Promise<{ fileId: string }>;

  /**
   * Get a temporary download URL for a file
   * @throws Error if not supported on current platform
   */
  getFileDownloadUrl?(fileId: string): Promise<{ downloadUrl: string }>;
}
```

#### Resource Operations (MCP only)

```typescript
interface AppsClient<T> {
  /**
   * Read a resource from the server
   */
  readResource(uri: string): Promise<ResourceReadResult>;
}

interface ResourceReadResult {
  contents: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: Uint8Array;
  }>;
}
```

#### Event Handlers

```typescript
interface AppsClient<T> {
  /**
   * Subscribe to tool result events
   * @returns Unsubscribe function
   */
  onToolResult(handler: (result: ToolResult<T>) => void): () => void;

  /**
   * Subscribe to tool input events
   * @returns Unsubscribe function
   */
  onToolInput(handler: (input: ToolInput) => void): () => void;

  /**
   * Subscribe to tool cancellation events (MCP only)
   * @returns Unsubscribe function
   */
  onToolCancelled(handler: (reason?: string) => void): () => void;

  /**
   * Subscribe to host context changes
   * @returns Unsubscribe function
   */
  onHostContextChange(handler: (context: HostContext) => void): () => void;

  /**
   * Subscribe to teardown events (MCP only)
   * @returns Unsubscribe function
   */
  onTeardown(handler: (reason?: string) => void): () => void;
}

interface ToolResult<T extends ToolDefs> {
  [K in keyof T]?: ToolOutputs<T>[K] & {
    _meta?: Record<string, unknown>;
  };
}

interface ToolInput {
  name: string;
  arguments: Record<string, unknown>;
}
```

#### Current State Properties

```typescript
interface AppsClient<T> {
  /**
   * Current host context
   */
  readonly hostContext: HostContext;

  /**
   * Current tool input arguments
   */
  readonly toolInput?: Record<string, unknown>;

  /**
   * Current tool output data
   */
  readonly toolOutput?: Record<string, unknown>;

  /**
   * Current tool metadata (UI-only)
   */
  readonly toolMeta?: Record<string, unknown>;
}
```

### `HostContext`

```typescript
interface HostContext {
  /**
   * Current theme
   */
  theme: "light" | "dark";

  /**
   * Current display mode
   */
  displayMode: "inline" | "fullscreen" | "pip";

  /**
   * Available display modes
   */
  availableDisplayModes: string[];

  /**
   * Viewport dimensions
   */
  viewport: {
    width: number;
    height: number;
    maxHeight?: number;
    maxWidth?: number;
  };

  /**
   * User locale (BCP 47, e.g., "en-US")
   */
  locale: string;

  /**
   * User timezone (IANA, e.g., "America/New_York")
   */
  timeZone?: string;

  /**
   * Platform type
   */
  platform: "web" | "desktop" | "mobile";

  /**
   * User agent string
   */
  userAgent?: string;

  /**
   * Device capabilities
   */
  deviceCapabilities?: {
    touch?: boolean;
    hover?: boolean;
  };

  /**
   * Safe area insets (for mobile notches)
   */
  safeAreaInsets?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };

  /**
   * Host-provided styles
   */
  styles?: {
    /**
     * CSS variable overrides
     */
    variables?: Record<string, string>;

    /**
     * Additional CSS
     */
    css?: {
      /**
       * Font @import rules
       */
      fonts?: string;
    };
  };
}
```

---

## React Bindings

### `useAppsClient()`

Hook to access the apps client.

```typescript
import { useAppsClient } from "@mcp-apps-kit/ui-react";

function MyComponent() {
  const client = useAppsClient<AppTools>();

  const handleClick = async () => {
    await client.callTool("my_tool", { arg: "value" });
  };

  return <button onClick={handleClick}>Call Tool</button>;
}
```

### `useToolResult()`

Hook to access the current tool result.

```typescript
import { useToolResult } from "@mcp-apps-kit/ui-react";

function MyComponent() {
  const result = useToolResult<AppTools>();

  // Access typed result data
  const data = result?.my_tool?.someField;

  return <div>{data}</div>;
}
```

### `useToolInput()`

Hook to access the current tool input.

```typescript
import { useToolInput } from "@mcp-apps-kit/ui-react";

function MyComponent() {
  const input = useToolInput();

  return <div>Called with: {JSON.stringify(input)}</div>;
}
```

### `useHostContext()`

Hook to access host context.

```typescript
import { useHostContext } from "@mcp-apps-kit/ui-react";

function MyComponent() {
  const context = useHostContext();

  return (
    <div className={context.theme}>
      Locale: {context.locale}
    </div>
  );
}
```

### `useWidgetState()`

Hook for persisted widget state.

```typescript
import { useWidgetState } from "@mcp-apps-kit/ui-react";

interface MyState {
  selectedTab: string;
  favorites: string[];
}

function MyComponent() {
  const [state, setState] = useWidgetState<MyState>({
    selectedTab: "overview",
    favorites: [],
  });

  const addFavorite = (id: string) => {
    setState(prev => ({
      ...prev,
      favorites: [...prev.favorites, id],
    }));
  };

  return (
    <div>
      <Tabs selected={state.selectedTab} />
      <Favorites ids={state.favorites} onAdd={addFavorite} />
    </div>
  );
}
```

### `useHostStyleVariables()`

Hook to apply host CSS variables.

```typescript
import { useHostStyleVariables } from "@mcp-apps-kit/ui-react";

function MyComponent() {
  // Automatically applies host CSS variables to document
  useHostStyleVariables();

  return <div>Styled content</div>;
}
```

### `useDocumentTheme()`

Hook to apply theme class to document.

```typescript
import { useDocumentTheme } from "@mcp-apps-kit/ui-react";

function MyComponent() {
  // Adds "light" or "dark" class to <html>
  useDocumentTheme();

  return <div>Themed content</div>;
}
```

### `useDisplayMode()`

Hook for display mode management.

```typescript
import { useDisplayMode } from "@mcp-apps-kit/ui-react";

function MyComponent() {
  const { mode, requestMode, availableModes } = useDisplayMode();

  return (
    <div>
      <span>Current: {mode}</span>
      {availableModes.includes("fullscreen") && (
        <button onClick={() => requestMode("fullscreen")}>
          Fullscreen
        </button>
      )}
    </div>
  );
}
```

### `AppsProvider`

Context provider for apps client.

```typescript
import { AppsProvider } from "@mcp-apps-kit/ui-react";

function App() {
  return (
    <AppsProvider
      name="My App"
      version="1.0.0"
      onError={(error) => console.error(error)}
    >
      <MyComponent />
    </AppsProvider>
  );
}
```

---

## Type Definitions

### Extracting Types from App Definition

```typescript
import { createApp, InferToolInputs, InferToolOutputs } from "@mcp-apps-kit/core";

const app = createApp({ /* ... */ });

// Extract tool types for use in UI
export type AppTools = typeof app.tools;
export type ToolInputs = InferToolInputs<AppTools>;
export type ToolOutputs = InferToolOutputs<AppTools>;

// Use in components
function MyComponent() {
  const client = useAppsClient<AppTools>();
  const result = useToolResult<AppTools>();

  // Fully typed!
  const restaurants = result?.search_restaurants?.restaurants;
}
```

### Type Utilities

```typescript
import { z } from "zod";

/**
 * Infer input types from tool definitions
 */
type InferToolInputs<T extends ToolDefs> = {
  [K in keyof T]: z.infer<T[K]["input"]>;
};

/**
 * Infer output types from tool definitions
 */
type InferToolOutputs<T extends ToolDefs> = {
  [K in keyof T]: T[K]["output"] extends z.ZodType
    ? z.infer<T[K]["output"]>
    : unknown;
};

/**
 * Create a typed tool definition helper
 */
function defineTool<TInput extends z.ZodType, TOutput extends z.ZodType>(
  def: ToolDef<TInput, TOutput>
): ToolDef<TInput, TOutput> {
  return def;
}

// Usage
const myTool = defineTool({
  description: "My tool",
  input: z.object({ query: z.string() }),
  output: z.object({ results: z.array(z.string()) }),
  handler: async (input) => {
    // input is typed as { query: string }
    return { results: ["a", "b"] };
  },
});
```

### Extending Types (Additive Properties)

The type system allows extra properties without breaking:

```typescript
// Server returns extra fields
handler: async (input) => {
  return {
    // Required by schema
    count: 10,
    results: [...],

    // Extra fields (allowed, typed as unknown on client)
    timing: 123,
    debug: { ... },

    // Special fields
    _text: "Found 10 results",
    _meta: { fullData: [...] },
  };
}

// Client access
const result = useToolResult<AppTools>();

// Typed fields
result?.search?.count; // number
result?.search?.results; // array

// Extra fields (allowed but typed as unknown)
result?.search?.timing; // unknown

// Access with type assertion if needed
const timing = result?.search?.timing as number;
```

### Error Types

```typescript
/**
 * Application error with metadata
 */
class AppError extends Error {
  constructor(options: {
    message: string;
    code?: string;
    authChallenge?: {
      scopes: string[];
    };
    meta?: Record<string, unknown>;
  });
}

/**
 * Tool execution error
 */
class ToolError extends AppError {
  toolName: string;
  arguments: Record<string, unknown>;
}

/**
 * Platform capability error
 */
class UnsupportedError extends AppError {
  feature: string;
  platform: "mcp" | "openai";
}
```

---

## CSS Variables Reference

Standard CSS variables provided by hosts:

### Colors

```css
:root {
  /* Primary */
  --color-background-primary: /* host value or fallback */;
  --color-background-secondary: /* ... */;
  --color-background-tertiary: /* ... */;

  --color-text-primary: /* ... */;
  --color-text-secondary: /* ... */;
  --color-text-tertiary: /* ... */;
  --color-text-quaternary: /* ... */;

  /* Accents */
  --color-accent: /* ... */;
  --color-accent-foreground: /* ... */;

  /* Borders */
  --color-border: /* ... */;
  --color-border-light: /* ... */;
  --color-border-heavy: /* ... */;
  --color-border-xheavy: /* ... */;

  /* States */
  --color-success: /* ... */;
  --color-warning: /* ... */;
  --color-error: /* ... */;
}
```

### Typography

```css
:root {
  /* Font families */
  --font-sans: /* ... */;
  --font-mono: /* ... */;

  /* Font sizes */
  --font-size-xs: /* ... */;
  --font-size-sm: /* ... */;
  --font-size-md: /* ... */;
  --font-size-lg: /* ... */;
  --font-size-xl: /* ... */;

  /* Line heights */
  --line-height-tight: /* ... */;
  --line-height-normal: /* ... */;
  --line-height-relaxed: /* ... */;

  /* Font weights */
  --font-weight-normal: /* ... */;
  --font-weight-medium: /* ... */;
  --font-weight-semibold: /* ... */;
  --font-weight-bold: /* ... */;
}
```

### Spacing

```css
:root {
  --spacing-xs: /* ... */;
  --spacing-sm: /* ... */;
  --spacing-md: /* ... */;
  --spacing-lg: /* ... */;
  --spacing-xl: /* ... */;
  --spacing-2xl: /* ... */;
}
```

### Radii

```css
:root {
  --border-radius-sm: /* ... */;
  --border-radius-md: /* ... */;
  --border-radius-lg: /* ... */;
  --border-radius-xl: /* ... */;
  --border-radius-full: 9999px;
}
```

### Shadows

```css
:root {
  --shadow-sm: /* ... */;
  --shadow-md: /* ... */;
  --shadow-lg: /* ... */;
}
```

### Recommended Fallbacks

```css
:root {
  /* Always define fallbacks for graceful degradation */
  --color-background-primary: light-dark(#ffffff, #171717);
  --color-background-secondary: light-dark(#f5f5f5, #262626);
  --color-text-primary: light-dark(#171717, #fafafa);
  --color-text-secondary: light-dark(#525252, #a3a3a3);
  --color-border: light-dark(#e5e5e5, #404040);
  --color-accent: light-dark(#0066cc, #3b82f6);

  --font-sans: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: ui-monospace, monospace;

  --border-radius-sm: 4px;
  --border-radius-md: 8px;
  --border-radius-lg: 12px;

  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
}
```
