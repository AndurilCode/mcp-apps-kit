/**
 * Host Emulators for UI Widget Testing
 *
 * These emulators simulate the host environments (Claude Desktop / ChatGPT)
 * for testing MCP Apps and OpenAI Apps widgets in headless environments.
 */

export {
  MCPHostEmulator,
  type MCPHostEmulatorOptions,
  type TrackedToolCall as MCPTrackedToolCall,
} from "./mcp-host";

export {
  OpenAIHostEmulator,
  type OpenAIHostEmulatorOptions,
  type TrackedStateChange,
  type TrackedToolCall as OpenAITrackedToolCall,
} from "./openai-host";
