# Data Model: Unified MCP Apps Builder SDK

**Feature Branch**: `001-unified-mcp-sdk`
**Date**: 2025-12-21

## Overview

This document defines the core type interfaces and data structures for the Unified MCP Apps Builder SDK. These types form the foundation of the type-safe API.

---

## Core Types

### 1. Tool Definition

```typescript
import { z } from "zod";

/**
 * Tool visibility determines who can invoke the tool
 */
type Visibility = "model" | "app" | "both";

/**
 * Single tool definition with Zod schemas
 */
interface ToolDef<
  TInput extends z.ZodType = z.ZodType,
  TOutput extends z.ZodType = z.ZodType
> {
  /** Human-readable description for the LLM */
  description: string;

  /** Optional display title (defaults to tool name) */
  title?: string;

  /** Zod schema for input validation */
  input: TInput;

  /** Zod schema for output validation (optional for type inference) */
  output?: TOutput;

  /** Async handler function with typed input */
  handler: (input: z.infer<TInput>) => Promise<
    z.infer<TOutput> & {
      /** Additional metadata for UI (not sent to model) */
      _meta?: Record<string, unknown>;
      /** Text narration for model (optional) */
      _text?: string;
    }
  >;

  /** UI resource to render results (references ui config key) */
  ui?: string;

  /** Who can call this tool */
  visibility?: Visibility;

  /** Message shown while tool is executing (ChatGPT only) */
  invokingMessage?: string;

  /** Message shown after tool completes (ChatGPT only) */
  invokedMessage?: string;
}

/**
 * Collection of tool definitions
 */
type ToolDefs = Record<string, ToolDef>;
```

### 2. UI Resource Definition

```typescript
/**
 * Content Security Policy configuration
 */
interface CSPConfig {
  /** Domains allowed for fetch/XHR/WebSocket */
  connectDomains?: string[];

  /** Domains allowed for images, scripts, stylesheets, fonts */
  resourceDomains?: string[];

  /** Domains for openExternal without modal (ChatGPT only) */
  redirectDomains?: string[];

  /** Allowed iframe origins (ChatGPT only, discouraged) */
  frameDomains?: string[];
}

/**
 * Single UI resource definition
 */
interface UIDef {
  /** HTML content: path to file or inline HTML string */
  html: string;

  /** Optional display name */
  name?: string;

  /** Optional description */
  description?: string;

  /** Content Security Policy */
  csp?: CSPConfig;

  /** Request a visible border around the widget */
  prefersBorder?: boolean;

  /** Dedicated domain for isolation (advanced) */
  domain?: string;
}

/**
 * Collection of UI resource definitions
 */
type UIDefs = Record<string, UIDef>;
```

### 3. App Configuration

```typescript
/**
 * OAuth 2.1 authentication configuration
 */
interface AuthConfig {
  type: "oauth2";
  scopes: string[];
  protectedResource: string;
  authorizationServer: string;
}

/**
 * CORS configuration
 */
interface CORSConfig {
  origin: string | string[] | boolean;
  credentials?: boolean;
}

/**
 * Main application configuration
 */
interface AppConfig {
  /** App name (used in MCP server registration) */
  name: string;

  /** Semantic version */
  version: string;

  /** Tool definitions */
  tools: ToolDefs;

  /** UI resource definitions */
  ui?: UIDefs;

  /** Global configuration */
  config?: {
    auth?: AuthConfig;
    cors?: CORSConfig;
  };
}
```

### 4. App Instance

```typescript
/**
 * Server start options
 */
interface StartOptions {
  port?: number;
  transport?: "http" | "stdio";
  cors?: CORSConfig;
}

/**
 * The App instance returned by createApp()
 */
interface App {
  /** Start the built-in Express server */
  start(options?: StartOptions): Promise<void>;

  /** Get the underlying MCP server instance */
  getServer(): McpServer;

  /** Get Express middleware for custom server setup */
  handler(): ExpressMiddleware;

  /** Handle a single request (for serverless) */
  handleRequest(req: Request, env?: unknown): Promise<Response>;

  /** Typed tool definitions (for type inference) */
  readonly tools: ToolDefs;
}
```

---

## Client Types

### 5. Host Context

```typescript
/**
 * Runtime context provided by the host platform
 */
interface HostContext {
  /** Current theme */
  theme: "light" | "dark";

  /** Current display mode */
  displayMode: "inline" | "fullscreen" | "pip";

  /** Available display modes */
  availableDisplayModes: string[];

  /** Viewport dimensions */
  viewport: {
    width: number;
    height: number;
    maxWidth?: number;
    maxHeight?: number;
  };

  /** BCP 47 locale code */
  locale: string;

  /** IANA timezone */
  timeZone?: string;

  /** Platform type */
  platform: "web" | "desktop" | "mobile";

  /** User agent string */
  userAgent?: string;

  /** Device capabilities */
  deviceCapabilities?: {
    touch?: boolean;
    hover?: boolean;
  };

  /** Safe area insets (mobile) */
  safeAreaInsets?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };

  /** Host-provided styling */
  styles?: {
    variables?: Record<string, string>;
    css?: {
      fonts?: string;
    };
  };
}
```

### 6. Apps Client Interface

```typescript
/**
 * Type utilities for extracting tool input/output types
 */
type ToolInputs<T extends ToolDefs> = {
  [K in keyof T]: z.infer<T[K]["input"]>;
};

type ToolOutputs<T extends ToolDefs> = {
  [K in keyof T]: T[K]["output"] extends z.ZodType
    ? z.infer<T[K]["output"]>
    : unknown;
};

/**
 * Tool result with metadata
 */
interface ToolResult<T extends ToolDefs> {
  [K in keyof T]?: ToolOutputs<T>[K] & {
    _meta?: Record<string, unknown>;
  };
}

/**
 * Unified client interface for UI code
 */
interface AppsClient<T extends ToolDefs> {
  // === Tool Operations ===

  /** Call a server tool with typed arguments */
  callTool<K extends keyof T>(
    name: K,
    args: ToolInputs<T>[K]
  ): Promise<ToolOutputs<T>[K]>;

  // === Messaging ===

  /** Send a message to the conversation */
  sendMessage(content: { type: "text"; text: string }): Promise<void>;

  /** Convenience alias for sendMessage */
  sendFollowUpMessage(prompt: string): Promise<void>;

  // === Navigation ===

  /** Open an external link */
  openLink(url: string): Promise<void>;

  /** Request a different display mode */
  requestDisplayMode(
    mode: "inline" | "fullscreen" | "pip"
  ): Promise<{ mode: string }>;

  /** Request widget close (ChatGPT only) */
  requestClose(): void;

  // === State ===

  /** Get persisted widget state */
  getState<S>(): S | null;

  /** Set persisted widget state */
  setState<S>(state: S): void;

  // === Files (Platform-Dependent) ===

  /** Upload a file (ChatGPT only) */
  uploadFile?(file: File): Promise<{ fileId: string }>;

  /** Get file download URL (ChatGPT only) */
  getFileDownloadUrl?(fileId: string): Promise<{ downloadUrl: string }>;

  // === Resources ===

  /** Read an MCP resource */
  readResource(uri: string): Promise<{ contents: ResourceContent[] }>;

  // === Logging ===

  /** Log to host console */
  log(level: "debug" | "info" | "warning" | "error", data: unknown): void;

  // === Events ===

  /** Subscribe to tool results */
  onToolResult(handler: (result: ToolResult<T>) => void): () => void;

  /** Subscribe to tool input changes */
  onToolInput(
    handler: (input: Record<string, unknown>) => void
  ): () => void;

  /** Subscribe to tool cancellation */
  onToolCancelled(handler: (reason?: string) => void): () => void;

  /** Subscribe to host context changes */
  onHostContextChange(handler: (context: HostContext) => void): () => void;

  /** Subscribe to teardown events */
  onTeardown(handler: (reason?: string) => void): () => void;

  // === Current State ===

  /** Current host context */
  readonly hostContext: HostContext;

  /** Current tool input (if any) */
  readonly toolInput?: Record<string, unknown>;

  /** Current tool output (if any) */
  readonly toolOutput?: Record<string, unknown>;

  /** Current tool metadata (if any) */
  readonly toolMeta?: Record<string, unknown>;
}
```

---

## Protocol Adapter Interface

### 7. Internal Protocol Adapter

```typescript
/**
 * Internal interface for protocol adapters
 * Implemented by McpAppsAdapter and ChatGptAppsAdapter
 */
interface ProtocolAdapter {
  /** Connect to the host */
  connect(): Promise<void>;

  /** Call a tool on the server */
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;

  /** Send a message */
  sendMessage(content: { type: string; text: string }): Promise<void>;

  /** Open external link */
  openLink(url: string): Promise<void>;

  /** Request display mode */
  requestDisplayMode(mode: string): Promise<{ mode: string }>;

  /** Request close (optional) */
  requestClose?(): void;

  /** Get persisted state */
  getState<S>(): S | null;

  /** Set persisted state */
  setState<S>(state: S): void;

  /** Upload file (optional) */
  uploadFile?(file: File): Promise<{ fileId: string }>;

  /** Get file download URL (optional) */
  getFileDownloadUrl?(fileId: string): Promise<{ downloadUrl: string }>;

  /** Read resource */
  readResource(uri: string): Promise<{ contents: ResourceContent[] }>;

  /** Log message */
  log(level: string, data: unknown): void;

  // === Events ===
  onToolResult(handler: (result: unknown) => void): () => void;
  onToolInput(handler: (input: unknown) => void): () => void;
  onToolCancelled(handler: (reason?: string) => void): () => void;
  onHostContextChange(handler: (context: HostContext) => void): () => void;
  onTeardown(handler: (reason?: string) => void): () => void;

  // === Accessors ===
  getHostContext(): HostContext;
  getToolInput(): Record<string, unknown> | undefined;
  getToolOutput(): Record<string, unknown> | undefined;
  getToolMeta(): Record<string, unknown> | undefined;
}
```

---

## Entity Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                        AppConfig                                 │
│  ┌──────────┐   ┌──────────┐   ┌──────────────┐                │
│  │ ToolDefs │   │  UIDefs  │   │ GlobalConfig │                │
│  │  (many)  │   │  (many)  │   │   (optional) │                │
│  └────┬─────┘   └────┬─────┘   └──────────────┘                │
│       │              │                                          │
│       │  references  │                                          │
│       └──────────────┘                                          │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ creates
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                           App                                    │
│  ┌──────────────┐  ┌───────────────┐  ┌─────────────────────┐  │
│  │ start()      │  │ getServer()   │  │ handler()           │  │
│  │ handleReq()  │  │               │  │                     │  │
│  └──────────────┘  └───────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ used by
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     AppsClient<T>                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                 ProtocolAdapter                           │  │
│  │  ┌─────────────────┐     ┌─────────────────┐             │  │
│  │  │ McpAppsAdapter  │ OR  │ChatGptAppsAdapter│             │  │
│  │  └─────────────────┘     └─────────────────┘             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────┐  ┌───────────────┐  ┌─────────────────────┐ │
│  │ HostContext   │  │ ToolResult<T> │  │ Event Subscriptions │ │
│  └───────────────┘  └───────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Validation Rules

| Entity | Field | Rule |
|--------|-------|------|
| ToolDef | `input` | Must be a valid Zod schema |
| ToolDef | `output` | Optional, but if provided must be a valid Zod schema |
| ToolDef | `handler` | Must return object matching `output` schema (if defined) |
| ToolDef | `ui` | If provided, must reference a key in `ui` config |
| UIDef | `html` | Must be a file path or valid HTML string |
| UIDef | `csp.connectDomains` | Each entry must be a valid URL origin |
| AppConfig | `name` | Non-empty string, valid npm package name format |
| AppConfig | `version` | Valid semver string |
| AppsClient | `callTool` | Tool name must exist in type parameter `T` |

---

## State Transitions

### App Lifecycle

```
                    ┌─────────────┐
                    │   Created   │
                    │ (createApp) │
                    └──────┬──────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌──────────┐    ┌───────────┐   ┌───────────┐
    │ Starting │    │ Exported  │   │ Exported  │
    │ (start)  │    │ (handler) │   │ (getServer│
    └────┬─────┘    └───────────┘   └───────────┘
         │
         ▼
    ┌──────────┐
    │ Running  │
    │ (serving)│
    └──────────┘
```

### Client Lifecycle

```
    ┌────────────────┐
    │ Uninitialized  │
    └───────┬────────┘
            │ createClient()
            ▼
    ┌────────────────┐
    │  Connecting    │
    └───────┬────────┘
            │ connect()
            ▼
    ┌────────────────┐
    │   Connected    │◄──────┐
    └───────┬────────┘       │
            │                │ onHostContextChange
            │ callTool()     │ onToolResult
            ▼                │
    ┌────────────────┐       │
    │  Tool Pending  │───────┘
    └────────────────┘
```
