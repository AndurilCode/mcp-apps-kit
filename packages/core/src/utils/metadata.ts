/**
 * Protocol metadata utilities
 *
 * Provides utilities for mapping tool definitions to protocol-specific metadata
 * formats for MCP Apps and ChatGPT Apps.
 */

import type { ToolDef, Visibility } from "../types/tools";
import { zodToJsonSchema } from "./schema";

// =============================================================================
// MCP VISIBILITY MAPPING
// =============================================================================

/**
 * MCP visibility value per PROTOCOL-COMPARISON.md
 * Array of who can invoke: "model", "app", or both
 */
export type McpVisibilityValue = ("model" | "app")[];

/**
 * MCP UI metadata structure per PROTOCOL-COMPARISON.md
 * All MCP-specific metadata goes under _meta.ui.*
 */
export interface McpUIMeta {
  resourceUri?: string;
  visibility?: McpVisibilityValue;
}

/**
 * Map visibility to MCP protocol format
 *
 * Per PROTOCOL-COMPARISON.md:
 * - Model + UI: ["model", "app"]
 * - Model Only: ["model"]
 * - UI Only: ["app"]
 *
 * @param visibility - Tool visibility setting
 * @returns MCP visibility array
 */
export function mapVisibilityToMcp(visibility?: Visibility): McpVisibilityValue {
  switch (visibility) {
    case "model":
      return ["model"];
    case "app":
      return ["app"];
    case "both":
    default:
      return ["model", "app"];
  }
}

// =============================================================================
// OPENAI VISIBILITY MAPPING
// =============================================================================

/**
 * OpenAI visibility settings with proper openai/ prefixed keys
 * Per PROTOCOL-COMPARISON.md:
 * - openai/visibility: "public" | "private"
 * - openai/widgetAccessible: boolean
 */
export interface OpenAIVisibilitySettings {
  "openai/visibility": "public" | "private";
  "openai/widgetAccessible": boolean;
}

/**
 * Map visibility to OpenAI/ChatGPT protocol settings
 *
 * Per PROTOCOL-COMPARISON.md:
 * - Model + UI: "public" + widgetAccessible: true
 * - Model Only: "public" + widgetAccessible: false
 * - UI Only: "private" + widgetAccessible: true
 *
 * @param visibility - Tool visibility setting
 * @returns OpenAI-specific visibility settings with openai/ prefixes
 */
export function mapVisibilityToOpenAI(visibility?: Visibility): OpenAIVisibilitySettings {
  switch (visibility) {
    case "model":
      return { "openai/visibility": "public", "openai/widgetAccessible": false };
    case "app":
      return { "openai/visibility": "private", "openai/widgetAccessible": true };
    case "both":
    default:
      return { "openai/visibility": "public", "openai/widgetAccessible": true };
  }
}

// =============================================================================
// TOOL METADATA GENERATION
// =============================================================================

/**
 * MCP tool metadata format
 */
export interface McpToolMetadata {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

/**
 * OpenAI tool metadata format
 */
export interface OpenAIToolMetadata {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    output_schema?: Record<string, unknown>;
    invokingMessage?: string;
    invokedMessage?: string;
  };
}

/**
 * Generate protocol-specific tool metadata
 *
 * @param name - Tool name
 * @param toolDef - Tool definition
 * @param protocol - Target protocol ("mcp" | "openai")
 * @returns Protocol-specific metadata object
 */
export function generateToolMetadata(
  name: string,
  toolDef: ToolDef,
  protocol: "mcp" | "openai"
): McpToolMetadata | OpenAIToolMetadata {
  if (protocol === "mcp") {
    return generateMcpMetadata(name, toolDef);
  } else {
    return generateOpenAIMetadata(name, toolDef);
  }
}

/**
 * Generate MCP-specific tool metadata
 */
function generateMcpMetadata(name: string, toolDef: ToolDef): McpToolMetadata {
  const visibilityAnnotations = mapVisibilityToMcp(toolDef.visibility);

  const annotations: Record<string, unknown> = {
    ...visibilityAnnotations,
  };

  // Add UI binding if specified
  if (toolDef.ui) {
    annotations.ui = toolDef.ui;
  }

  // Add title if specified
  if (toolDef.title) {
    annotations.title = toolDef.title;
  }

  return {
    name,
    description: toolDef.description,
    inputSchema: zodToJsonSchema(toolDef.input),
    annotations:
      Object.keys(annotations).length > 0 ? annotations : undefined,
  };
}

/**
 * Generate OpenAI/ChatGPT-specific tool metadata
 */
function generateOpenAIMetadata(name: string, toolDef: ToolDef): OpenAIToolMetadata {
  const visibilitySettings = mapVisibilityToOpenAI(toolDef.visibility);

  // Build output schema if UI binding or output schema is specified
  let outputSchema: Record<string, unknown> | undefined;

  if (toolDef.ui || toolDef.output) {
    outputSchema = {};

    if (toolDef.ui) {
      outputSchema.ui = toolDef.ui;
    }

    if (toolDef.output) {
      outputSchema.schema = zodToJsonSchema(toolDef.output);
    }
  }

  const functionDef: OpenAIToolMetadata["function"] = {
    name,
    description: toolDef.description,
    parameters: zodToJsonSchema(toolDef.input),
    ...visibilitySettings,
  };

  if (outputSchema) {
    functionDef.output_schema = outputSchema;
  }

  if (toolDef.invokingMessage) {
    functionDef.invokingMessage = toolDef.invokingMessage;
  }

  if (toolDef.invokedMessage) {
    functionDef.invokedMessage = toolDef.invokedMessage;
  }

  return {
    type: "function",
    function: functionDef,
  };
}

// =============================================================================
// BATCH METADATA GENERATION
// =============================================================================

/**
 * Generate metadata for all tools in a collection
 *
 * @param tools - Collection of tool definitions
 * @param protocol - Target protocol
 * @returns Array of protocol-specific metadata objects
 */
export function generateAllToolsMetadata(
  tools: Record<string, ToolDef>,
  protocol: "mcp" | "openai"
): (McpToolMetadata | OpenAIToolMetadata)[] {
  return Object.entries(tools).map(([name, toolDef]) =>
    generateToolMetadata(name, toolDef, protocol)
  );
}
