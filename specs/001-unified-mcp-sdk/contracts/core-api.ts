/**
 * @mcp-apps-kit/core API Contract
 *
 * This file defines the public API surface for the core package.
 * All exports listed here MUST be implemented and tested.
 */

import type { z } from "zod";

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

/**
 * Tool visibility options
 */
export type Visibility = "model" | "app" | "both";

/**
 * Tool definition with Zod schemas
 */
export interface ToolDef<
  TInput extends z.ZodType = z.ZodType,
  TOutput extends z.ZodType = z.ZodType
> {
  description: string;
  title?: string;
  input: TInput;
  output?: TOutput;
  handler: (input: z.infer<TInput>) => Promise<
    z.infer<TOutput> & {
      _meta?: Record<string, unknown>;
      _text?: string;
    }
  >;
  ui?: string;
  visibility?: Visibility;
  invokingMessage?: string;
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
 * CSP configuration
 */
export interface CSPConfig {
  connectDomains?: string[];
  resourceDomains?: string[];
  redirectDomains?: string[];
  frameDomains?: string[];
}

/**
 * UI resource definition
 */
export interface UIDef {
  html: string;
  name?: string;
  description?: string;
  csp?: CSPConfig;
  prefersBorder?: boolean;
  domain?: string;
}

/**
 * Collection of UI definitions
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
  name: string;
  version: string;
  tools: T;
  ui?: UIDefs;
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
 */
export interface McpServer {
  // Opaque type - actual implementation from MCP SDK
}

/**
 * Express middleware type
 */
export type ExpressMiddleware = (
  req: unknown,
  res: unknown,
  next: () => void
) => void;

/**
 * App instance returned by createApp()
 */
export interface App<T extends ToolDefs = ToolDefs> {
  start(options?: StartOptions): Promise<void>;
  getServer(): McpServer;
  handler(): ExpressMiddleware;
  handleRequest(req: Request, env?: unknown): Promise<Response>;
  readonly tools: T;
}

// =============================================================================
// TYPE UTILITIES
// =============================================================================

/**
 * Extract input types from tool definitions
 */
export type InferToolInputs<T extends ToolDefs> = {
  [K in keyof T]: z.infer<T[K]["input"]>;
};

/**
 * Extract output types from tool definitions
 */
export type InferToolOutputs<T extends ToolDefs> = {
  [K in keyof T]: T[K]["output"] extends z.ZodType
    ? z.infer<T[K]["output"]>
    : unknown;
};

// =============================================================================
// MAIN ENTRY POINT
// =============================================================================

/**
 * Create an MCP app with unified tool and UI definitions
 *
 * @param config - App configuration with tools and UI resources
 * @returns App instance for starting server or getting middleware
 *
 * @example
 * ```typescript
 * const app = createApp({
 *   name: "my-app",
 *   version: "1.0.0",
 *   tools: {
 *     greet: {
 *       description: "Greet a user",
 *       input: z.object({ name: z.string() }),
 *       output: z.object({ message: z.string() }),
 *       handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
 *     },
 *   },
 * });
 *
 * await app.start({ port: 3000 });
 * ```
 */
export declare function createApp<T extends ToolDefs>(
  config: AppConfig<T>
): App<T>;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Define a tool with type inference (optional helper)
 */
export declare function defineTool<
  TInput extends z.ZodType,
  TOutput extends z.ZodType
>(def: ToolDef<TInput, TOutput>): ToolDef<TInput, TOutput>;

/**
 * Define a UI resource with type inference (optional helper)
 */
export declare function defineUI(def: UIDef): UIDef;
