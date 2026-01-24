/**
 * Logging middleware - tracks tool execution timing
 *
 * This middleware runs for every tool call and logs:
 * - Tool name when called
 * - Duration when completed
 */

import { defineMiddleware } from "@mcp-apps-kit/codegen";

export default defineMiddleware({
  before: async (context) => {
    context.state.set("startTime", Date.now());
    console.log(`[weather-app] Tool called: ${context.toolName}`); // eslint-disable-line no-console
  },
  after: async (context) => {
    const startTime = context.state.get("startTime") as number;
    const duration = Date.now() - startTime;
    console.log(`[weather-app] Tool completed: ${context.toolName} (${duration}ms)`); // eslint-disable-line no-console
  },
});
