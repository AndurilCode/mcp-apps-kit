/**
 * Core type definitions for @apps-builder/core
 */

import type { z } from "zod";

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

/**
 * Tool visibility determines who can invoke the tool
 */
export type Visibility = "model" | "app" | "both";

/**
 * Single tool definition with Zod schemas
 */
export interface ToolDef<
  TInput extends z.ZodType = z.ZodType,
  TOutput extends z.ZodType = z.ZodType,
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
  handler: (
    input: z.infer<TInput>
  ) => Promise<
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
export type ToolDefs = Record<string, ToolDef>;

// =============================================================================
// UI DEFINITIONS
// =============================================================================

/**
 * Content Security Policy configuration
 */
export interface CSPConfig {
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
export interface UIDef {
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
export type UIDefs = Record<string, UIDef>;

// =============================================================================
// APP CONFIGURATION
// =============================================================================

/**
 * OAuth 2.1 authentication configuration
 */
export interface AuthConfig {
  type: "oauth2";
  scopes: string[];
  protectedResource: string;
  authorizationServer: string;
}

/**
 * CORS configuration
 */
export interface CORSConfig {
  origin: string | string[] | boolean;
  credentials?: boolean;
}

/**
 * Main application configuration
 */
export interface AppConfig<T extends ToolDefs = ToolDefs> {
  /** App name (used in MCP server registration) */
  name: string;

  /** Semantic version */
  version: string;

  /** Tool definitions */
  tools: T;

  /** UI resource definitions */
  ui?: UIDefs;

  /** Global configuration */
  config?: {
    auth?: AuthConfig;
    cors?: CORSConfig;
  };
}

// =============================================================================
// APP INSTANCE
// =============================================================================

/**
 * Server start options
 */
export interface StartOptions {
  port?: number;
  transport?: "http" | "stdio";
  cors?: CORSConfig;
}

/**
 * MCP Server type (from @modelcontextprotocol/sdk)
 * Using unknown to avoid direct dependency coupling
 */
export interface McpServer {
  // Opaque type - actual implementation from MCP SDK
  [key: string]: unknown;
}

/**
 * Express middleware type
 */
export type ExpressMiddleware = (
  req: unknown,
  res: unknown,
  next: () => void
) => void | Promise<void>;

/**
 * App instance returned by createApp()
 */
export interface App<T extends ToolDefs = ToolDefs> {
  /** Start the built-in Express server */
  start(options?: StartOptions): Promise<void>;

  /** Get the underlying MCP server instance */
  getServer(): McpServer;

  /** Get Express middleware for custom server setup */
  handler(): ExpressMiddleware;

  /** Handle a single request (for serverless) */
  handleRequest(req: Request, env?: unknown): Promise<Response>;

  /** Typed tool definitions (for type inference) */
  readonly tools: T;
}

// =============================================================================
// TYPE UTILITIES
// =============================================================================

/**
 * Extract input types from tool definitions
 *
 * @example
 * ```typescript
 * type Inputs = InferToolInputs<typeof app.tools>;
 * // { greet: { name: string }, search: { query: string } }
 * ```
 */
export type InferToolInputs<T extends ToolDefs> = {
  [K in keyof T]: z.infer<T[K]["input"]>;
};

/**
 * Extract output types from tool definitions
 *
 * @example
 * ```typescript
 * type Outputs = InferToolOutputs<typeof app.tools>;
 * // { greet: { message: string }, search: { results: string[] } }
 * ```
 */
export type InferToolOutputs<T extends ToolDefs> = {
  [K in keyof T]: T[K]["output"] extends z.ZodType ? z.infer<T[K]["output"]> : unknown;
};
