/**
 * @mcp-apps-kit/testing
 *
 * Comprehensive testing library for MCP applications.
 *
 * @example
 * ```typescript
 * import { createTestEnvironment, expectToolResult } from "@mcp-apps-kit/testing";
 *
 * const env = await createTestEnvironment({ app });
 * const result = await env.client.callTool("greet", { name: "Alice" });
 * expectToolResult(result).toMatchObject({ message: "Hello, Alice!" });
 * await env.cleanup();
 * ```
 */

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type {
  // Tool result types
  ContentBlock,
  ToolResult,
  ToolCall,
  // Test client types
  TestClient,
  TestClientOptions,
  // Test server types
  TestServer,
  TestServerOptions,
  ExternalServerOptions,
  // Test environment types
  TestEnvironment,
  TestEnvironmentOptions,
  // Behavior testing types
  TestCase,
  TestSuite,
  TestCaseResult,
  TestSuiteResult,
  // Property testing types
  PropertyTestOptions,
  // LLM evaluation types
  LLMEvaluator,
  LLMEvaluatorConfig,
  EvalCriterion,
  EvalOptions,
  CriterionResult,
  EvaluationResult,
  CustomEvalOptions,
  // UI testing types
  MockHost,
  MockHostOptions,
  // Framework matcher types
  ToolResultAssertion,
} from "./types";

// =============================================================================
// ERROR EXPORTS
// =============================================================================

export {
  TestingError,
  ConnectionError,
  TimeoutError,
  ServerStartupError,
  AssertionError,
  PropertyFailureError,
  ConfigurationError,
} from "./errors";

// =============================================================================
// DEBUG EXPORTS
// =============================================================================

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
} from "./debug";

// =============================================================================
// MAIN API EXPORTS
// =============================================================================

// Server utilities - Phase 3
export { createTestClient, startTestServer } from "./server";

// Behavior testing - Phase 4
export { expectToolResult, defineTestSuite, runTestSuite } from "./eval/behavior";
export type { TestSuiteConfig } from "./eval/behavior";

// Framework adapters - Phase 5
// Note: Vitest and Jest adapters are exported via subpath exports in package.json
// They are available as @mcp-apps-kit/testing/vitest and @mcp-apps-kit/testing/jest

// Behavior testing - Phase 4
// export { expectToolResult, defineTestSuite, runTestSuite } from "./eval/behavior";

// Property testing - Phase 6
// export { generators, forAllInputs } from "./eval/property";

// LLM evaluation - Phase 8
// export { createLLMEvaluator, criteria } from "./eval/llm";

// UI testing - Phase 7
// export { createMockHost } from "./ui";
