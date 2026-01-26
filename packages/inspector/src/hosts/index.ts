/**
 * Host Emulators for UI Widget Testing
 *
 * These emulators simulate the host environments (Claude Desktop / ChatGPT)
 * for testing MCP Apps and OpenAI Apps widgets in headless environments.
 */

// Base class and shared types
export {
  BaseHostEmulator,
  type JSDOMInterface,
  type TrackedToolCall,
  type BaseHostEmulatorOptions,
} from "./base-host";

// MCP Host Emulator
export {
  MCPHostEmulator,
  type MCPHostEmulatorOptions,
  type MCPEnvironmentSettings,
  type TrackedToolCall as MCPTrackedToolCall,
} from "./mcp-host";

// OpenAI Host Emulator
export {
  OpenAIHostEmulator,
  type OpenAIHostEmulatorOptions,
  type OpenAIEnvironmentSettings,
  type TrackedStateChange,
  type TrackedToolCall as OpenAITrackedToolCall,
} from "./openai-host";
