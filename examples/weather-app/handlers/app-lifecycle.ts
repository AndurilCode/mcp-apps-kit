/**
 * App lifecycle handler - logs app start/shutdown events
 */

import { defineHandler, Events } from "@mcp-apps-kit/codegen";

export default defineHandler({
  event: Events.APP_START,
  handler: async (payload) => {
    console.log(`[weather-app] Server started on port ${payload.port}`);
  },
});
