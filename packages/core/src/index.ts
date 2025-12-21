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

// Metadata utilities
export {
  mapVisibilityToMcp,
  mapVisibilityToOpenAI,
  generateToolMetadata,
  generateAllToolsMetadata,
} from "./utils/metadata";
export type {
  McpVisibilityAnnotations,
  OpenAIVisibilitySettings,
  McpToolMetadata,
  OpenAIToolMetadata,
} from "./utils/metadata";

// CSP utilities
export {
  generateMcpCSPMetadata,
  generateOpenAICSPMetadata,
  generateMcpUIMetadata,
  generateOpenAIUIMetadata,
} from "./utils/csp";
export type {
  McpCSPMetadata,
  OpenAICSPMetadata,
  McpUIResourceMetadata,
  OpenAIUIResourceMetadata,
} from "./utils/csp";

// =============================================================================
// MAIN ENTRY POINTS
// =============================================================================

export { createApp, defineTool, defineUI } from "./createApp";
