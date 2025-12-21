/**
 * Protocol detection for auto-selecting the correct adapter
 */

import type { DetectedProtocol } from "./types";

/**
 * Detect the current host protocol
 *
 * Detection order:
 * 1. `window.openai` exists → ChatGPT Apps
 * 2. `window.parent !== window` (iframe) → MCP Apps
 * 3. Neither → Mock (development mode)
 *
 * @returns Detected protocol type
 */
export function detectProtocol(): DetectedProtocol {
  // Server-side: default to mock
  if (typeof window === "undefined") {
    return "mock";
  }

  // Check for OpenAI/ChatGPT Apps SDK
  if ("openai" in window) {
    return "openai";
  }

  // Check for iframe (MCP Apps)
  if (window.parent !== window) {
    return "mcp";
  }

  // Default to mock for development
  return "mock";
}
