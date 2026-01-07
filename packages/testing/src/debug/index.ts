/**
 * Debug logging module for @mcp-apps-kit/testing
 *
 * Provides debug logging using the debug package convention.
 * Enable with: DEBUG=mcp-testing:*
 */

export {
  createDebugLogger,
  serverLogger,
  clientLogger,
  behaviorLogger,
  propertyLogger,
  llmLogger,
  uiLogger,
  matcherLogger,
  testingLogger,
} from "./logger";
