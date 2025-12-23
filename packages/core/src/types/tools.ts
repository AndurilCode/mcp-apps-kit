/**
 * Core type definitions for @mcp-apps-kit/core
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
 * User location provided by the client
 *
 * Coarse location hint for analytics, formatting, or localization.
 * Only available when the client provides this information.
 */
export interface UserLocation {
  /** City name */
  city?: string;
  /** Region/state/province */
  region?: string;
  /** Country name or code */
  country?: string;
  /** IANA timezone (e.g., "America/New_York") */
  timezone?: string;
  /** Latitude coordinate */
  latitude?: number;
  /** Longitude coordinate */
  longitude?: number;
}

/**
 * Context provided by the client during tool invocation
 *
 * Contains metadata hints from the host platform (ChatGPT, Claude Desktop, etc.).
 * All fields are optional as availability depends on the client.
 *
 * @example
 * ```typescript
 * handler: async (input, context) => {
 *   if (context.locale) {
 *     // Format response in user's preferred language
 *   }
 *   if (context.userLocation?.timezone) {
 *     // Adjust times to user's timezone
 *   }
 * }
 * ```
 */
export interface ToolContext {
  /**
   * User's preferred locale (BCP 47 format).
   * Use for localization and formatting.
   *
   * @example "en-US", "fr-FR", "ja-JP"
   */
  locale?: string;

  /**
   * Client user agent string.
   * Use for analytics or client-specific formatting.
   * Never rely on this for authentication.
   */
  userAgent?: string;

  /**
   * Coarse user location.
   * Use for localization, timezone adjustments, or regional content.
   */
  userLocation?: UserLocation;

  /**
   * Anonymized user identifier.
   * Use for rate limiting or session correlation.
   * Never use for authentication or PII.
   */
  subject?: string;

  /**
   * Widget session ID for component correlation.
   * Stable across tool calls within the same widget instance.
   */
  widgetSessionId?: string;

  /**
   * Raw _meta object from the client.
   * Access protocol-specific fields not mapped to typed properties.
   */
  raw?: Record<string, unknown>;
}

/**
 * Tool annotations provide behavioral hints to the AI model
 *
 * These help the model understand the nature of the tool and
 * allow hosts to optimize UX (e.g., skip confirmations for read-only tools).
 */
export interface ToolAnnotations {
  /**
   * Tool only reads data without side effects.
   * Hosts may skip confirmation prompts for read-only tools.
   *
   * @example true for "getWeather", "searchProducts"
   */
  readOnlyHint?: boolean;

  /**
   * Tool performs destructive or irreversible operations.
   * Hosts may show additional confirmation for destructive tools.
   *
   * @example true for "deleteAccount", "formatDisk"
   */
  destructiveHint?: boolean;

  /**
   * Tool interacts with external systems or the public internet.
   * Helps models understand the scope of the operation.
   *
   * @example true for "sendEmail", "postToTwitter"
   */
  openWorldHint?: boolean;

  /**
   * Tool is safe to call multiple times with the same input.
   * Repeated calls produce the same result without cumulative effects.
   *
   * @example true for "getUser", false for "incrementCounter"
   */
  idempotentHint?: boolean;
}

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

  /**
   * Async handler function with typed input and context
   *
   * @param input - Validated input matching the Zod schema
   * @param context - Client-provided metadata (locale, location, etc.)
   * @returns Promise resolving to the output matching the output schema
   *
   * @example
   * ```typescript
   * handler: async (input, context) => {
   *   console.log(`Locale: ${context.locale}`);
   *   return { message: `Hello, ${input.name}!` };
   * }
   * ```
   */
  handler: (
    input: z.infer<TInput>,
    context: ToolContext
  ) => Promise<
    z.infer<TOutput> & {
      /** Additional metadata for UI (not sent to model) */
      _meta?: Record<string, unknown>;
      /** Text narration for model (optional) */
      _text?: string;
      /**
       * Close the widget after this tool response (ChatGPT only).
       *
       * When true, the widget will be closed after the response is processed.
       * Useful for completing flows like checkout or submission.
       *
       * @example
       * ```typescript
       * handler: async (input) => ({
       *   success: true,
       *   message: "Order placed!",
       *   _closeWidget: true,
       * })
       * ```
       */
      _closeWidget?: boolean;
    }
  >;

  /** UI resource to render results (references ui config key) */
  ui?: string;

  /** Who can call this tool */
  visibility?: Visibility;

  /** Whether the widget/app can invoke this tool (ChatGPT only) */
  widgetAccessible?: boolean;

  /** Message shown while tool is executing (ChatGPT only) */
  invokingMessage?: string;

  /** Message shown after tool completes (ChatGPT only) */
  invokedMessage?: string;

  /**
   * Input parameters that accept file references (ChatGPT only).
   *
   * List parameter names that should accept uploaded file IDs.
   * ChatGPT will allow users to attach files to these parameters.
   *
   * @example ["imageFile", "documentFile"]
   */
  fileParams?: string[];

  /**
   * Behavioral hints for the AI model.
   * Help hosts optimize UX and models understand tool behavior.
   */
  annotations?: ToolAnnotations;
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

/**
 * Convert @mcp-apps-kit/core tool definitions (Zod-based) into the tool type
 * shape expected by @mcp-apps-kit/ui.
 *
 * This is the recommended way to get end-to-end typing for UI clients without
 * duplicating schemas.
 *
 * @example
 * ```ts
 * import type { ClientToolsFromCore } from "@mcp-apps-kit/core";
 * import { createClient } from "@mcp-apps-kit/ui";
 *
 * type AppClientTools = ClientToolsFromCore<typeof app.tools>;
 * const client = await createClient<AppClientTools>();
 * ```
 */
export type ClientToolsFromCore<T extends ToolDefs> = {
  [K in keyof T]: {
    input: z.input<T[K]["input"]>;
    output: T[K]["output"] extends z.ZodType ? z.infer<T[K]["output"]> : unknown;
  };
};
