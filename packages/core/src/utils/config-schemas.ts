/**
 * Shared Zod schemas for configuration validation
 *
 * These schemas are used by both @mcp-apps-kit/core and @mcp-apps-kit/codegen
 * to ensure consistent validation rules across the codebase.
 *
 * Usage:
 * - Import schemas and use .safeParse() for validation
 * - Handle ZodError differently in each package (AppError vs plain Error)
 */

import { z } from "zod";
import { OAuthConfigSchema } from "../server/oauth/types.js";

/**
 * Valid protocol values
 */
export const ProtocolSchema = z
  .enum(["mcp", "openai"], {
    message: "must be 'mcp' or 'openai'",
  })
  .nullable()
  .optional()
  .describe("Server protocol type");

/**
 * CORS configuration schema
 * Uses record type since CORS config allows arbitrary key-value pairs
 */
export const CorsSchema = z
  .record(z.string(), z.unknown())
  .nullable()
  .optional()
  .describe("CORS configuration object");

/**
 * Debug log levels
 */
export const DebugLevelSchema = z.enum(["debug", "info", "warn", "error"], {
  message: "must be one of: 'debug', 'info', 'warn', 'error'",
});

/**
 * Debug transport types
 */
export const DebugTransportSchema = z.enum(["builtin", "tool", "api"], {
  message: "must be one of: 'builtin', 'tool', 'api'",
});

/**
 * Debug configuration schema
 */
export const DebugConfigSchema = z
  .object({
    logTool: z.boolean().nullable().optional(),
    level: DebugLevelSchema.nullable().optional(),
    batchSize: z.number().int().positive().nullable().optional(),
    flushIntervalMs: z.number().int().nonnegative().nullable().optional(),
    transport: DebugTransportSchema.nullable().optional(),
    apiEndpoint: z
      .string()
      .startsWith("/", { message: 'apiEndpoint must start with "/"' })
      .nullable()
      .optional(),
  })
  .nullable()
  .optional()
  .describe("Debug configuration");

/**
 * Server route schema - validates route starts with "/" and is not "/health"
 */
export const ServerRouteSchema = z
  .string()
  .startsWith("/", { message: 'serverRoute must start with "/"' })
  .refine((route) => route !== "/health", {
    message: 'serverRoute cannot be "/health" as it conflicts with the health check endpoint',
  })
  .nullable()
  .optional()
  .describe("Server route path");

/**
 * OpenAI domain challenge token schema
 */
export const DomainChallengeSchema = z
  .string()
  .min(1, { message: "domain_challenge cannot be an empty string" })
  .max(1000, { message: "domain_challenge cannot exceed 1000 characters" });

/**
 * OpenAI configuration schema
 */
export const OpenAIConfigSchema = z
  .object({
    domain_challenge: DomainChallengeSchema.optional(),
  })
  .nullable()
  .optional()
  .describe("OpenAI-specific configuration");

/**
 * Complete global configuration schema
 * Can be used to validate the entire global config at once
 */
export const GlobalConfigSchema = z.object({
  protocol: ProtocolSchema,
  cors: CorsSchema,
  debug: DebugConfigSchema,
  serverRoute: ServerRouteSchema,
  oauth: OAuthConfigSchema.nullable().optional(),
  openai: OpenAIConfigSchema,
});

/**
 * Version directories schema for file-based configs
 */
export const VersionDirectoriesSchema = z
  .object({
    root: z.string().optional(),
    tools: z.string().optional(),
    workflows: z.string().optional(),
    ui: z.string().optional(),
    uiWidgets: z.string().optional(),
    uiWidgetsOutDir: z.string().optional(),
    middleware: z.string().optional(),
    handlers: z.string().optional(),
  })
  .optional();

/**
 * Helper type for validation result
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: z.ZodError };

/**
 * Validate global config fields and return a result object
 * This allows callers to handle errors as they see fit (AppError vs plain Error)
 */
export function validateGlobalConfigSchema(
  config: Record<string, unknown>
): ValidationResult<z.infer<typeof GlobalConfigSchema>> {
  const result = GlobalConfigSchema.safeParse(config);
  return result;
}

/**
 * Format Zod error into a user-friendly message
 */
export function formatZodError(error: z.ZodError, prefix = "Config"): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${prefix}.${issue.path.join(".")}` : prefix;
    return `${path}: ${issue.message}`;
  });
  return issues.join("; ");
}

// Re-export OAuthConfigSchema for convenience
export { OAuthConfigSchema };
