/**
 * Configuration validation utilities for @mcp-apps-kit/core
 *
 * Uses shared Zod schemas from config-schemas.ts for validation rules.
 * Converts validation errors to AppError for consistent error handling.
 *
 * @mcp-apps-kit/codegen also uses these schemas but converts to plain Error.
 */

import { AppError, ErrorCode } from "./errors";
import {
  ProtocolSchema,
  CorsSchema,
  DebugConfigSchema,
  ServerRouteSchema,
  OpenAIConfigSchema,
  GlobalConfigSchema,
  formatZodError,
  OAuthConfigSchema,
} from "./config-schemas.js";

/**
 * Validate protocol field
 * Accepts null for versioned configs (inheritance/disable pattern)
 */
export function validateProtocol(
  protocol: unknown,
  prefix = "Config"
): asserts protocol is "mcp" | "openai" | null | undefined {
  const result = ProtocolSchema.safeParse(protocol);
  if (!result.success) {
    throw new AppError(
      ErrorCode.INVALID_CONFIG,
      formatZodError(result.error, `${prefix}.protocol`)
    );
  }
}

/**
 * Validate CORS configuration
 */
export function validateCors(cors: unknown, prefix = "Config"): void {
  const result = CorsSchema.safeParse(cors);
  if (!result.success) {
    throw new AppError(ErrorCode.INVALID_CONFIG, formatZodError(result.error, `${prefix}.cors`));
  }
}

/**
 * Validate debug configuration
 */
export function validateDebug(debug: unknown, prefix = "Config"): void {
  const result = DebugConfigSchema.safeParse(debug);
  if (!result.success) {
    throw new AppError(ErrorCode.INVALID_CONFIG, formatZodError(result.error, `${prefix}.debug`));
  }
}

/**
 * Validate serverRoute configuration
 * Accepts null for versioned configs (inheritance/disable pattern)
 */
export function validateServerRoute(serverRoute: unknown, prefix = "Config"): void {
  const result = ServerRouteSchema.safeParse(serverRoute);
  if (!result.success) {
    throw new AppError(
      ErrorCode.INVALID_CONFIG,
      formatZodError(result.error, `${prefix}.serverRoute`)
    );
  }
}

/**
 * Validate OAuth configuration
 */
export function validateOAuth(oauth: unknown, prefix = "Config"): void {
  if (oauth === undefined || oauth === null) {
    return;
  }
  const result = OAuthConfigSchema.safeParse(oauth);
  if (!result.success) {
    throw new AppError(ErrorCode.INVALID_CONFIG, formatZodError(result.error, `${prefix}.oauth`));
  }
}

/**
 * Validate OpenAI configuration
 */
export function validateOpenAI(openai: unknown, prefix = "Config"): void {
  const result = OpenAIConfigSchema.safeParse(openai);
  if (!result.success) {
    throw new AppError(ErrorCode.INVALID_CONFIG, formatZodError(result.error, `${prefix}.openai`));
  }
}

/**
 * Validate global configuration object
 * Accepts GlobalConfig, Partial<GlobalConfig>, or VersionSpecificConfig (which allows null values)
 */
export function validateGlobalConfig(config: Record<string, unknown>, prefix = "Config"): void {
  const result = GlobalConfigSchema.safeParse(config);
  if (!result.success) {
    throw new AppError(ErrorCode.INVALID_CONFIG, formatZodError(result.error, prefix));
  }
}
