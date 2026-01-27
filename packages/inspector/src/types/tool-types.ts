/**
 * Tool Types
 *
 * Types for tool operations, resources, and prompts.
 */

// =============================================================================
// TOOL HINTS (for agent guidance)
// =============================================================================

/**
 * Hints embedded in tool responses to guide agents on next steps.
 * Progressive disclosure: keeps tool descriptions minimal while providing
 * contextual guidance in responses.
 */
export interface ToolHints {
  /** Suggested next action after this tool */
  next?: string;
  /** Alternative approaches to consider */
  alternatives?: string[];
  /** Warning about potential issues */
  warning?: string;
}

// =============================================================================
// TOOL TYPES
// =============================================================================

/**
 * Tool info from list_tools
 */
export interface ToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/**
 * Input for call_tool
 */
export interface CallToolInput {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Content block in tool result
 */
export interface ContentBlock {
  type: "text" | "image" | "resource";
  text?: string;
  data?: string;
  mimeType?: string;
}

/**
 * Output from call_tool
 */
export interface CallToolOutput {
  content: ContentBlock[];
  isError: boolean;
  structuredContent?: unknown;
  error?: { code: string; message: string };
  duration: number;
  sessionId?: string;
  /** Guidance hints for agent */
  hints?: ToolHints;
}

// =============================================================================
// RESOURCE TYPES
// =============================================================================

/**
 * Resource info from list_resources
 */
export interface ResourceInfo {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

/**
 * Input for read_resource
 */
export interface ReadResourceInput {
  uri: string;
}

/**
 * Output from read_resource
 */
export interface ReadResourceOutput {
  contents: ContentBlock[];
}

// =============================================================================
// PROMPT TYPES
// =============================================================================

/**
 * Prompt info from list_prompts
 */
export interface PromptInfo {
  name: string;
  description?: string;
}

/**
 * Input for get_prompt
 */
export interface GetPromptInput {
  name: string;
  arguments?: Record<string, string>;
}

/**
 * Prompt message
 */
export interface PromptMessage {
  role: "user" | "assistant";
  content: {
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
  };
}

/**
 * Output from get_prompt
 */
export interface GetPromptOutput {
  description?: string;
  messages: PromptMessage[];
}
