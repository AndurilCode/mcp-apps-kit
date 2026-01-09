/**
 * Protocol detection for auto-selecting the correct adapter
 *
 * @internal
 */

import type { DetectedProtocol } from "./types";

/**
 * Detect the current host protocol
 *
 * Detection order:
 * 1. `window.openai` exists → ChatGPT Apps
 * 2. ChatGPT sandbox indicators (URL patterns) → ChatGPT Apps
 * 3. `window.parent !== window` (iframe) → MCP Apps
 * 4. Neither → Mock (development mode)
 *
 * @returns Detected protocol type
 *
 * @internal
 */
export function detectProtocol(): DetectedProtocol {
  // Server-side: default to mock
  if (typeof window === "undefined") {
    return "mock";
  }

  // Check for OpenAI/ChatGPT Apps SDK (already injected)
  if ("openai" in window) {
    return "openai";
  }

  // Check for ChatGPT sandbox environment (SDK will be injected)
  const url = window.location.href;
  const referrer = document.referrer;
  const isChatGPTSandbox =
    url.includes("/api/apps/chatgpt/") ||
    url.includes("chatgpt") ||
    url.includes("sandbox-proxy") ||
    url.includes("widget-content") ||
    referrer.includes("chatgpt") ||
    referrer.includes("openai.com");

  if (isChatGPTSandbox) {
    return "openai";
  }

  // Check for iframe (MCP Apps)
  if (window.parent !== window) {
    return "mcp";
  }

  // Default to mock for development
  return "mock";
}
