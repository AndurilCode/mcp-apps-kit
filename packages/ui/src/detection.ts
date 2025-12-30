/**
 * Protocol detection for auto-selecting the correct adapter
 *
 * @internal
 */

import type { DetectedProtocol } from "./types";

/**
 * Check if we're in a ChatGPT sandbox environment
 */
function isChatGPTSandbox(): boolean {
  // Check URL patterns that indicate ChatGPT sandbox
  const url = window.location.href;
  if (url.includes("/api/apps/chatgpt/") || url.includes("chatgpt")) {
    return true;
  }

  // Check for ChatGPT-specific sandbox proxy indicators
  if (url.includes("sandbox-proxy") || url.includes("widget-content")) {
    return true;
  }

  // Check referrer
  const referrer = document.referrer;
  if (referrer.includes("chatgpt") || referrer.includes("openai.com")) {
    return true;
  }

  return false;
}

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
  if (isChatGPTSandbox()) {
    return "openai";
  }

  // Check for iframe (MCP Apps)
  if (window.parent !== window) {
    return "mcp";
  }

  // Default to mock for development
  return "mock";
}
