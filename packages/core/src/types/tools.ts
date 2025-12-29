/**
 * Core type definitions for @mcp-apps-kit/core
 */

import type { z } from "zod";
import type { Middleware } from "../middleware/types";
import type { EventMap, EventHandler, AnyEventHandler, UnsubscribeFn } from "../events/types";

// Use Zod's built-in type inference utilities directly

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
   * User identifier from the request context.
   *
   * - **With OAuth enabled**: Contains the authenticated user's subject (sub claim) from the verified JWT token.
   *   This is a verified identity that can be used for authorization and user-specific logic.
   * - **Without OAuth**: May contain an anonymized identifier for rate limiting or session correlation.
   *   Do not use for authentication or PII in this case.
   *
   * When OAuth is configured, this value is server-validated and overrides any client-provided value.
   * Access full auth details via `context.raw?.["mcp-apps-kit/auth"]`.
   *
   * @example
   * ```typescript
   * handler: async (input, context) => {
   *   // With OAuth: verified user identifier
   *   const userId = context.subject;
   *
   *   // Access full auth context (scopes, clientId, token, etc.)
   *   const auth = context.raw?.["mcp-apps-kit/auth"];
   *   const scopes = auth?.scopes ?? [];
   *
   *   return { message: `Hello, ${userId}!` };
   * }
   * ```
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

  /**
   * Shared state map populated by middleware.
   * Middleware can use state.set() to share data with tool handlers.
   *
   * @example
   * ```typescript
   * // In middleware
   * context.state.set("userId", "user-123");
   *
   * // In tool handler
   * const userId = context.state?.get("userId");
   * ```
   */
  state?: Map<string, unknown>;
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

  /**
   * UI resource to render results.
   *
   * Can be:
   * - A string key referencing a UI defined in createApp's `ui` config (legacy)
   * - A UIDef object for colocated UI definition (recommended)
   *
   * @example Colocated UI (recommended)
   * ```typescript
   * const myTool = defineTool({
   *   ui: defineUI({
   *     html: "./widget.html",
   *     prefersBorder: true,
   *   }),
   *   // ...
   * });
   * ```
   *
   * @example String reference (legacy)
   * ```typescript
   * const myTool = defineTool({
   *   ui: "my-widget", // References ui config in createApp
   *   // ...
   * });
   * ```
   */
  ui?: string | UIDef;

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
// TOOL DEFINITION HELPER
// =============================================================================

/**
 * Helper function to define a tool with proper type inference.
 *
 * This helper solves TypeScript's generic type inference limitations
 * by capturing the specific schema types at the call site.
 *
 * @example
 * ```typescript
 * const myTool = defineTool({
 *   description: "My tool description",
 *   input: z.object({ name: z.string() }),
 *   output: z.object({ result: z.string() }),
 *   handler: async (input, context) => {
 *     // input is fully typed as { name: string }
 *     return { result: `Hello ${input.name}` };
 *   }
 * });
 * ```
 */
export function defineTool<TInput extends z.ZodType, TOutput extends z.ZodType>(
  definition: Omit<ToolDef<TInput, TOutput>, "handler"> & {
    handler: (
      input: z.infer<TInput>,
      context: ToolContext
    ) => Promise<
      z.infer<TOutput> & {
        _meta?: Record<string, unknown>;
        _text?: string;
        _closeWidget?: boolean;
      }
    >;
  }
): ToolDef<TInput, TOutput> {
  return definition as ToolDef<TInput, TOutput>;
}

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

import type { UIDef } from "./ui";

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

  /**
   * Get the underlying Express app for serverless deployments (e.g., Vercel).
   * Use this for default exports in serverless environments.
   *
   * @example
   * ```typescript
   * // For Vercel deployment, export the Express app:
   * export default app.expressApp;
   * ```
   */
  readonly expressApp: unknown;

  /** Handle a single request (for serverless) */
  handleRequest(req: Request, env?: unknown): Promise<Response>;

  /** Typed tool definitions (for type inference) */
  readonly tools: T;

  // ---------------------------------------------------------------------------
  // MIDDLEWARE
  // ---------------------------------------------------------------------------

  /**
   * Register middleware function
   *
   * Middleware executes in registration order before tool handlers.
   * Multiple middleware can be registered via multiple use() calls.
   *
   * @param middleware - Middleware function
   *
   * @example
   * ```typescript
   * app.use(loggingMiddleware);
   * app.use(authMiddleware);
   * app.use(rateLimitMiddleware);
   * ```
   */
  use(middleware: Middleware): void;

  // ---------------------------------------------------------------------------
  // EVENTS
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to event
   *
   * Handler called every time event is emitted until unsubscribed.
   * Handlers execute in registration order.
   * Errors in handlers are isolated (logged but don't affect other handlers).
   *
   * @param event - Event name (type-checked)
   * @param handler - Handler function (payload type inferred)
   * @returns Unsubscribe function
   */
  on<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): UnsubscribeFn;

  /**
   * Subscribe to event (one-time)
   *
   * Handler called once, then automatically unsubscribed.
   * Useful for initialization events or one-time setup.
   *
   * @param event - Event name (type-checked)
   * @param handler - Handler function (payload type inferred)
   * @returns Unsubscribe function (can call to cancel before event fires)
   */
  once<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): UnsubscribeFn;

  /**
   * Subscribe to all events (wildcard listener)
   *
   * Handler receives every event with event name and payload.
   * Useful for logging, debugging, or analytics.
   *
   * @param handler - Handler function receiving all events
   * @returns Unsubscribe function
   */
  onAny(handler: AnyEventHandler): UnsubscribeFn;
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
