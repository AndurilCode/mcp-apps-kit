/**
 * @apps-builder/core
 *
 * Server-side framework for building MCP applications.
 *
 * @example
 * ```typescript
 * import { createApp } from "@apps-builder/core";
 * import { z } from "zod";
 *
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

// =============================================================================
// TYPE EXPORTS
// =============================================================================

// Tool types
export type {
  Visibility,
  ToolDef,
  ToolDefs,
  StartOptions,
  App,
  McpServer,
  ExpressMiddleware,
  InferToolInputs,
  InferToolOutputs,
} from "./types/tools";

// UI types
export type { CSPConfig, UIDef, UIDefs } from "./types/ui";

// Config types
export type { AuthConfig, CORSConfig, GlobalConfig, AppConfig } from "./types/config";

// =============================================================================
// UTILITY EXPORTS
// =============================================================================

// Schema utilities
export { zodToJsonSchema, extractPropertyDescriptions, isZodSchema } from "./utils/schema";
export type { JSONSchema, ZodToJsonSchemaOptions } from "./utils/schema";

// Error utilities
export { AppError, ErrorCode, formatZodError, wrapError } from "./utils/errors";
export type { ErrorCodeType } from "./utils/errors";

// =============================================================================
// MAIN ENTRY POINTS (Placeholders - Implemented in Phase 3)
// =============================================================================

import type { ToolDefs, App } from "./types/tools";
import type { AppConfig } from "./types/config";

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
export function createApp<T extends ToolDefs>(_config: AppConfig<T>): App<T> {
  // Placeholder - will be implemented in Phase 3
  throw new Error("createApp() not implemented yet - Phase 3");
}

/**
 * Define a tool with type inference (optional helper)
 *
 * This is an optional helper for better IDE experience.
 * You can also define tools inline in the `tools` object.
 *
 * @param def - Tool definition
 * @returns The same tool definition (for type inference)
 *
 * @example
 * ```typescript
 * const greetTool = defineTool({
 *   description: "Greet a user",
 *   input: z.object({ name: z.string() }),
 *   output: z.object({ message: z.string() }),
 *   handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
 * });
 * ```
 */
export function defineTool<T>(def: T): T {
  return def;
}

/**
 * Define a UI resource with type inference (optional helper)
 *
 * @param def - UI resource definition
 * @returns The same UI definition (for type inference)
 *
 * @example
 * ```typescript
 * const widget = defineUI({
 *   html: "./widget.html",
 *   csp: { connectDomains: ["https://api.example.com"] },
 * });
 * ```
 */
export function defineUI<T>(def: T): T {
  return def;
}
