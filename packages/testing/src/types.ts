/**
 * Shared types and interfaces for @mcp-apps-kit/testing
 *
 * Core types used across all testing utilities.
 */

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { ZodType } from "zod";

// =============================================================================
// TOOL RESULT TYPES
// =============================================================================

/**
 * Content block in a tool result
 */
export interface ContentBlock {
  type: "text" | "image" | "resource";
  text?: string;
  data?: string;
  mimeType?: string;
}

/**
 * Result from calling an MCP tool
 */
export interface ToolResult {
  /** Result content (display text blocks) */
  content: ContentBlock[];
  /** Whether the call resulted in an error */
  isError?: boolean;
  /**
   * Structured content from the tool result (if present).
   * This is the typed data returned by the tool, separate from display text.
   * Use this for assertions when you want to test the actual data.
   */
  structuredContent?: unknown;
}

/**
 * Tool call with metadata
 */
export interface ToolCall {
  /** Tool name */
  name: string;
  /** Tool arguments */
  args: unknown;
  /** Result (if successful) */
  result?: ToolResult;
  /** Error (if failed) */
  error?: Error;
  /** Call duration in ms */
  duration: number;
  /** Timestamp */
  timestamp: Date;
}

// =============================================================================
// TEST CLIENT TYPES
// =============================================================================

/**
 * Options for creating a test client
 */
export interface TestClientOptions {
  /** Track call history for assertions (default: false) */
  trackHistory?: boolean;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Number of retries on failure (default: 0) */
  retries?: number;
}

/**
 * Test client wrapper around MCP SDK client
 */
export interface TestClient {
  /** Underlying MCP SDK client for advanced usage */
  readonly raw: Client;

  /** Call a tool and return the result */
  callTool(name: string, args: unknown): Promise<ToolResult>;

  /** List available tools */
  listTools(): Promise<Array<{ name: string; description?: string }>>;

  /** List available resources */
  listResources(): Promise<Array<{ uri: string; name?: string; description?: string }>>;

  /** Read a resource by URI */
  readResource(uri: string): Promise<{ contents: ContentBlock[] }>;

  /** Get call history (if trackHistory enabled) */
  getCallHistory(): ToolCall[];

  /** Clear call history */
  clearHistory(): void;

  /** Disconnect from server */
  disconnect(): Promise<void>;
}

// =============================================================================
// TEST SERVER TYPES
// =============================================================================

/**
 * Options for starting a test server from an App instance
 */
export interface TestServerOptions {
  /** Port to listen on (0 for dynamic) */
  port?: number;
  /** Startup timeout in ms (default: 10000) */
  timeout?: number;
}

/**
 * Options for starting an external server process
 */
export interface ExternalServerOptions {
  /** Command to run */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Port the server will listen on */
  port: number;
  /** Regex pattern to detect server ready in stdout */
  readyPattern?: RegExp;
  /** Startup timeout in ms (default: 10000) */
  timeout?: number;
  /** Environment variables */
  env?: Record<string, string>;
}

/**
 * Running test server instance
 */
export interface TestServer {
  /** Base URL of the server */
  readonly url: string;
  /** MCP endpoint URL */
  readonly mcpUrl: string;
  /** Server port */
  readonly port: number;
  /** Stop the server and release resources */
  stop(): Promise<void>;
}

// =============================================================================
// TEST ENVIRONMENT TYPES
// =============================================================================

/**
 * Options for creating a test environment
 */
export interface TestEnvironmentOptions {
  /** mcp-apps-kit App instance */
  app?: unknown; // Using unknown to avoid direct dependency on @mcp-apps-kit/core
  /** Existing server URL (alternative to app) */
  serverUrl?: string;
  /** Test client options */
  clientOptions?: TestClientOptions;
  /** Server port (default: auto-assigned) */
  port?: number;
  /** API version for versioned apps (e.g., 'v1', 'v2') */
  version?: string;
}

/**
 * Test environment coordinating server and client
 */
export interface TestEnvironment {
  /** Test server instance */
  readonly server: TestServer;
  /** Connected test client */
  readonly client: TestClient;
  /** Clean up all resources */
  cleanup(): Promise<void>;
}

// =============================================================================
// BEHAVIOR TESTING TYPES
// =============================================================================

/**
 * Test case definition
 */
export interface TestCase {
  /** Case name */
  name: string;
  /** Tool input arguments */
  input: unknown;
  /** Expected output (partial match) */
  expected?: unknown;
  /** Expected error */
  expectError?: { code?: string; message?: RegExp };
  /** Skip this case */
  skip?: boolean;
  /** Only run this case */
  only?: boolean;
  /** Timeout for this case in ms */
  timeout?: number;
}

/**
 * Test suite definition
 */
export interface TestSuite {
  /** Suite name */
  name: string;
  /** Tool being tested */
  tool: string;
  /** Test cases */
  cases: TestCase[];
  /** Setup function run before each case */
  beforeEach?: () => Promise<void>;
  /** Teardown function run after each case */
  afterEach?: () => Promise<void>;
}

/**
 * Result of a single test case
 */
export interface TestCaseResult {
  /** Case name */
  name: string;
  /** Pass/fail status */
  status: "passed" | "failed" | "skipped";
  /** Duration in ms */
  duration: number;
  /** Error if failed */
  error?: Error;
  /** Actual result */
  actual?: unknown;
  /** Expected result */
  expected?: unknown;
}

/**
 * Result of running a test suite
 */
export interface TestSuiteResult {
  /** Suite name */
  name: string;
  /** Total cases */
  total: number;
  /** Passed cases */
  passed: number;
  /** Failed cases */
  failed: number;
  /** Skipped cases */
  skipped: number;
  /** Individual case results */
  cases: TestCaseResult[];
  /** Total duration in ms */
  duration: number;
}

// =============================================================================
// PROPERTY TESTING TYPES
// =============================================================================

/**
 * Options for property-based tests
 */
export interface PropertyTestOptions {
  /** Number of test runs (default: 100) */
  numRuns?: number;
  /** Random seed for reproducibility */
  seed?: number;
  /** Timeout per run in ms */
  timeout?: number;
}

// =============================================================================
// LLM EVALUATION TYPES
// =============================================================================

/**
 * Evaluation criterion
 */
export interface EvalCriterion {
  /** Criterion name */
  name: string;
  /** Description for LLM */
  description: string;
  /** Pass threshold (default: 0.7) */
  threshold?: number;
}

/**
 * Options for LLM evaluation
 */
export interface EvalOptions {
  /** Evaluation criteria */
  criteria: EvalCriterion[];
  /** Context about the tool being evaluated */
  context?: {
    toolName?: string;
    input?: unknown;
    description?: string;
  };
}

/**
 * Result for a single criterion
 */
export interface CriterionResult {
  /** Criterion name */
  name: string;
  /** Score from 0-1 */
  score: number;
  /** Pass/fail based on threshold */
  pass: boolean;
  /** LLM explanation */
  explanation: string;
}

/**
 * Overall evaluation result
 */
export interface EvaluationResult {
  /** Overall evaluation */
  overall: {
    score: number;
    pass: boolean;
  };
  /** Per-criterion results */
  criteria: CriterionResult[];
  /** Raw LLM response for debugging */
  rawResponse?: string;
}

/**
 * LLM evaluator configuration
 */
export interface LLMEvaluatorConfig {
  /** Provider type */
  provider: "openai" | "anthropic";
  /** Model name */
  model: string;
  /** Pass threshold (default: 0.7) */
  passThreshold?: number;
}

/**
 * LLM evaluator interface
 */
export interface LLMEvaluator {
  /** Evaluate result against criteria */
  evaluate(result: unknown, options: EvalOptions): Promise<EvaluationResult>;
  /** Evaluate with custom prompt */
  evaluateWithPrompt(result: unknown, options: CustomEvalOptions): Promise<unknown>;
}

/**
 * Options for custom evaluation prompt
 */
export interface CustomEvalOptions {
  /** Custom evaluation prompt */
  prompt: string;
  /** Parse the LLM response */
  parseResponse?: (response: string) => unknown;
}

// =============================================================================
// UI TESTING TYPES
// =============================================================================

/**
 * Options for creating a mock host
 */
export interface MockHostOptions {
  /** Protocol type */
  protocol?: "mcp" | "openai";
  /** Initial host context */
  initialContext?: {
    theme?: "light" | "dark";
    displayMode?: "inline" | "fullscreen";
    viewport?: { width: number; height: number };
  };
  /** Host capabilities */
  capabilities?: {
    fileUpload?: boolean;
    displayModes?: { modes: string[] };
  };
}

/**
 * Mock host environment for UI testing
 */
export interface MockHost {
  /** Emit a tool result to UI */
  emitToolResult(result: unknown): void;
  /** Set the theme */
  setTheme(theme: "light" | "dark"): void;
  /** Get the current theme */
  getTheme(): "light" | "dark";
  /** Emit cancellation */
  emitToolCancelled(reason?: string): void;
  /** Emit teardown */
  emitTeardown(reason?: string): void;
  /** Get tool call history */
  getToolCallHistory(): ToolCall[];
  /** Clear call history */
  clearHistory(): void;
  /** Register tool call handler */
  onToolCall(handler: (name: string, args: unknown) => void): () => void;
  /** Register tool result handler */
  onToolResult(handler: (result: unknown) => void): () => void;
  /** Register teardown handler */
  onTeardown(handler: (reason?: string) => void): () => void;
  /** Register tool cancelled handler */
  onToolCancelled(handler: (reason?: string) => void): () => void;
  /** Simulate a tool call (for testing) */
  simulateToolCall(name: string, args: unknown): void;
  /** Get underlying adapter (if @mcp-apps-kit/ui is available) */
  getAdapter(): unknown;
}

// =============================================================================
// FRAMEWORK MATCHER TYPES
// =============================================================================

/**
 * Assertion interface for tool results
 */
export interface ToolResultAssertion {
  /** Match against expected object (partial) */
  toMatchObject(expected: unknown): void;
  /** Match against Zod schema */
  toMatchSchema(schema: ZodType): void;
  /** Assert no error occurred */
  toHaveNoError(): void;
  /** Assert error occurred (optionally with code) */
  toHaveError(code?: string): void;
  /** Assert result contains text */
  toContainText(text: string): void;
}
