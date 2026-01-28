/**
 * MCP Primitives Types
 *
 * Types for Tools, Resources, and Prompts from the MCP server.
 * Aligned with @modelcontextprotocol/sdk types.
 */

// =============================================================================
// Common Types
// =============================================================================

/**
 * JSON Schema property definition (simplified for UI display)
 */
export interface JsonSchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  default?: unknown;
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  [key: string]: unknown; // Allow additional JSON Schema fields
}

/**
 * Icon for tools, resources, and prompts
 */
export interface McpIcon {
  src: string;
  mimeType?: string;
  sizes?: string[];
  theme?: "light" | "dark";
}

// =============================================================================
// Tool Types (from tools/list)
// =============================================================================

/**
 * Tool annotations providing hints about tool behavior
 */
export interface McpToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/**
 * Tool execution configuration
 */
export interface McpToolExecution {
  taskSupport?: "optional" | "required" | "forbidden";
}

/**
 * MCP Tool definition
 */
export interface McpTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, JsonSchemaProperty>;
    required?: string[];
    [key: string]: unknown; // Allow additional JSON Schema fields
  };
  outputSchema?: {
    type: "object";
    properties?: Record<string, JsonSchemaProperty>;
    required?: string[];
    [key: string]: unknown;
  };
  annotations?: McpToolAnnotations;
  execution?: McpToolExecution;
  icons?: McpIcon[];
  _meta?: Record<string, unknown>;
}

// =============================================================================
// Resource Types (from resources/list)
// =============================================================================

/**
 * Resource annotations
 */
export interface McpResourceAnnotations {
  audience?: Array<"user" | "assistant">;
  priority?: number;
  lastModified?: string; // ISO datetime
}

/**
 * MCP Resource definition
 */
export interface McpResource {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
  annotations?: McpResourceAnnotations;
  icons?: McpIcon[];
  _meta?: Record<string, unknown>;
}

// =============================================================================
// Prompt Types (from prompts/list)
// =============================================================================

/**
 * Prompt argument definition
 */
export interface McpPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

/**
 * MCP Prompt definition
 */
export interface McpPrompt {
  name: string;
  title?: string;
  description?: string;
  arguments?: McpPromptArgument[];
  icons?: McpIcon[];
  _meta?: Record<string, unknown>;
}

// =============================================================================
// Combined Types
// =============================================================================

/**
 * Combined primitives response from the inspector
 */
export interface McpPrimitives {
  tools: McpTool[];
  resources: McpResource[];
  prompts: McpPrompt[];
}

/**
 * Loading state for primitives
 */
export interface McpPrimitivesState {
  primitives: McpPrimitives | null;
  loading: boolean;
  error: string | null;
}
