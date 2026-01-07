/**
 * Debug logger for @mcp-apps-kit/testing
 *
 * Uses the debug package convention for conditional logging.
 * Enable with: DEBUG=mcp-testing:*
 */

import debug from "debug";

// =============================================================================
// DEBUG NAMESPACES
// =============================================================================

/**
 * Create a debug logger for a specific namespace
 *
 * @param namespace - Namespace (e.g., 'server', 'client', 'matchers')
 * @returns Debug function
 *
 * @example
 * ```typescript
 * const log = createDebugLogger('server');
 * log('Server starting on port %d', 3000);
 * ```
 */
export function createDebugLogger(namespace: string): debug.Debugger {
  return debug(`mcp-testing:${namespace}`);
}

// =============================================================================
// DEFAULT LOGGERS
// =============================================================================

/**
 * Default debug logger for server utilities
 */
export const serverLogger = createDebugLogger("server");

/**
 * Default debug logger for client utilities
 */
export const clientLogger = createDebugLogger("client");

/**
 * Default debug logger for behavior testing
 */
export const behaviorLogger = createDebugLogger("behavior");

/**
 * Default debug logger for property testing
 */
export const propertyLogger = createDebugLogger("property");

/**
 * Default debug logger for LLM evaluation
 */
export const llmLogger = createDebugLogger("llm");

/**
 * Default debug logger for UI testing
 */
export const uiLogger = createDebugLogger("ui");

/**
 * Default debug logger for matchers
 */
export const matcherLogger = createDebugLogger("matchers");

/**
 * Default debug logger for general testing operations
 */
export const testingLogger = createDebugLogger("testing");
