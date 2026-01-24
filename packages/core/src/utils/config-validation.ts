/**
 * Shared configuration validation utilities
 *
 * Used by @mcp-apps-kit/core for runtime configuration validation.
 *
 * NOTE: A lightweight version of this validation exists in @mcp-apps-kit/codegen
 * (packages/codegen/src/config.ts) that uses plain Error instead of AppError.
 * If validation rules change here, the codegen version must also be updated.
 */

import { AppError, ErrorCode } from "./errors";
import { OAuthConfigSchema } from "../server/oauth/types.js";

/**
 * Validate protocol field
 * Accepts null for versioned configs (inheritance/disable pattern)
 */
export function validateProtocol(
  protocol: unknown,
  prefix = "Config"
): asserts protocol is "mcp" | "openai" | null | undefined {
  if (protocol !== undefined && protocol !== null && protocol !== "mcp" && protocol !== "openai") {
    throw new AppError(ErrorCode.INVALID_CONFIG, `${prefix}.protocol must be 'mcp' or 'openai'`);
  }
}

/**
 * Validate CORS configuration
 */
export function validateCors(cors: unknown, prefix = "Config"): void {
  if (cors !== undefined && cors !== null) {
    if (typeof cors !== "object") {
      throw new AppError(ErrorCode.INVALID_CONFIG, `${prefix}.cors must be an object`);
    }
  }
}

/**
 * Validate debug configuration
 */
export function validateDebug(debug: unknown, prefix = "Config"): void {
  if (debug !== undefined && debug !== null) {
    if (typeof debug !== "object") {
      throw new AppError(ErrorCode.INVALID_CONFIG, `${prefix}.debug must be an object or null`);
    }

    const debugConfig = debug as Record<string, unknown>;

    // Validate logTool
    if (
      debugConfig.logTool !== undefined &&
      debugConfig.logTool !== null &&
      typeof debugConfig.logTool !== "boolean"
    ) {
      throw new AppError(
        ErrorCode.INVALID_CONFIG,
        `${prefix}.debug.logTool must be a boolean if provided`
      );
    }

    // Validate level
    if (debugConfig.level !== undefined && debugConfig.level !== null) {
      if (typeof debugConfig.level !== "string") {
        throw new AppError(ErrorCode.INVALID_CONFIG, `${prefix}.debug.level must be a string`);
      }
      const validLevels = ["debug", "info", "warn", "error"];
      if (!validLevels.includes(debugConfig.level)) {
        throw new AppError(
          ErrorCode.INVALID_CONFIG,
          `${prefix}.debug.level must be one of: ${validLevels.join(", ")}`
        );
      }
    }

    // Validate batchSize
    if (debugConfig.batchSize !== undefined && debugConfig.batchSize !== null) {
      if (typeof debugConfig.batchSize !== "number" || debugConfig.batchSize < 1) {
        throw new AppError(
          ErrorCode.INVALID_CONFIG,
          `${prefix}.debug.batchSize must be a positive number`
        );
      }
    }

    // Validate flushIntervalMs
    if (debugConfig.flushIntervalMs !== undefined && debugConfig.flushIntervalMs !== null) {
      if (typeof debugConfig.flushIntervalMs !== "number" || debugConfig.flushIntervalMs < 0) {
        throw new AppError(
          ErrorCode.INVALID_CONFIG,
          `${prefix}.debug.flushIntervalMs must be a non-negative number`
        );
      }
    }

    // Validate transport
    if (debugConfig.transport !== undefined && debugConfig.transport !== null) {
      if (typeof debugConfig.transport !== "string") {
        throw new AppError(ErrorCode.INVALID_CONFIG, `${prefix}.debug.transport must be a string`);
      }
      const validTransports = ["builtin", "tool", "api"];
      if (!validTransports.includes(debugConfig.transport)) {
        throw new AppError(
          ErrorCode.INVALID_CONFIG,
          `${prefix}.debug.transport must be one of: ${validTransports.join(", ")}`
        );
      }
    }

    // Validate apiEndpoint
    if (debugConfig.apiEndpoint !== undefined && debugConfig.apiEndpoint !== null) {
      if (typeof debugConfig.apiEndpoint !== "string") {
        throw new AppError(
          ErrorCode.INVALID_CONFIG,
          `${prefix}.debug.apiEndpoint must be a string`
        );
      }
      if (!debugConfig.apiEndpoint.startsWith("/")) {
        throw new AppError(
          ErrorCode.INVALID_CONFIG,
          `${prefix}.debug.apiEndpoint must start with "/", got: "${debugConfig.apiEndpoint}"`
        );
      }
    }
  }
}

/**
 * Validate serverRoute configuration
 * Accepts null for versioned configs (inheritance/disable pattern)
 */
export function validateServerRoute(serverRoute: unknown, prefix = "Config"): void {
  if (serverRoute !== undefined && serverRoute !== null) {
    if (typeof serverRoute !== "string") {
      throw new AppError(ErrorCode.INVALID_CONFIG, `${prefix}.serverRoute must be a string`);
    }
    if (!serverRoute.startsWith("/")) {
      throw new AppError(
        ErrorCode.INVALID_CONFIG,
        `${prefix}.serverRoute must start with "/", got: "${serverRoute}"`
      );
    }
    if (serverRoute === "/health") {
      throw new AppError(
        ErrorCode.INVALID_CONFIG,
        `${prefix}.serverRoute cannot be "/health" as it conflicts with the health check endpoint`
      );
    }
  }
}

/**
 * Validate OAuth configuration
 */
export function validateOAuth(oauth: unknown, prefix = "Config"): void {
  if (oauth !== undefined && oauth !== null) {
    try {
      OAuthConfigSchema.parse(oauth);
    } catch (error) {
      if (error instanceof Error) {
        throw new AppError(
          ErrorCode.INVALID_CONFIG,
          `${prefix}.oauth: Invalid OAuth configuration: ${error.message}`
        );
      }
      throw new AppError(ErrorCode.INVALID_CONFIG, `${prefix}.oauth: Invalid OAuth configuration`);
    }
  }
}

/**
 * Validate OpenAI configuration
 */
export function validateOpenAI(openai: unknown, prefix = "Config"): void {
  if (openai !== undefined && openai !== null) {
    if (typeof openai !== "object") {
      throw new AppError(ErrorCode.INVALID_CONFIG, `${prefix}.openai must be an object or null`);
    }

    const openaiConfig = openai as Record<string, unknown>;

    if (openaiConfig.domain_challenge !== undefined) {
      const token = openaiConfig.domain_challenge;
      if (typeof token !== "string") {
        throw new AppError(
          ErrorCode.INVALID_CONFIG,
          `${prefix}.openai.domain_challenge must be a string`
        );
      }
      if (token.length === 0) {
        throw new AppError(
          ErrorCode.INVALID_CONFIG,
          `${prefix}.openai.domain_challenge cannot be an empty string`
        );
      }
      if (token.length > 1000) {
        throw new AppError(
          ErrorCode.INVALID_CONFIG,
          `${prefix}.openai.domain_challenge cannot exceed 1000 characters`
        );
      }
    }
  }
}

/**
 * Validate global configuration object
 * Accepts GlobalConfig, Partial<GlobalConfig>, or VersionSpecificConfig (which allows null values)
 */
export function validateGlobalConfig(config: Record<string, unknown>, prefix = "Config"): void {
  validateServerRoute(config.serverRoute, prefix);
  validateProtocol(config.protocol, prefix);
  validateDebug(config.debug, prefix);
  validateOAuth(config.oauth, prefix);
  validateOpenAI(config.openai, prefix);
  validateCors(config.cors, prefix);
}
