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
// APP INSTANCE
// =============================================================================

import type { CORSConfig } from "./config";

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

import type { UIDefs } from "./ui";

/**
 * App instance returned by createApp()
 */
export interface App<T extends ToolDefs = ToolDefs, U extends UIDefs | undefined = UIDefs | undefined> {
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

  /** UI resource definitions (for type inference) */
  readonly ui: U;
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
