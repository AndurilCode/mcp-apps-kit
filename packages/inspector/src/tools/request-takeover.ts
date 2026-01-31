/**
 * request_takeover tool
 *
 * Allows an agent to request control of the Inspector when it is in Human mode.
 * The human user will see an approval dialog and can allow or deny the request.
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import {
  getDashboardMode,
  requestTakeover,
  getTakeoverStatus,
} from "../dashboard/dashboard-server";

/** Maximum time (ms) to wait for the human to respond */
const TAKEOVER_TIMEOUT_MS = 30_000;

/** Polling interval (ms) while waiting for response */
const POLL_INTERVAL_MS = 1_000;

export const requestTakeoverInputSchema = z.object({
  reason: z.string().optional().describe("Why the agent wants to take control of the Inspector"),
});

export const requestTakeoverOutputSchema = z.object({
  requestId: z.string(),
  status: z.enum(["pending", "approved", "denied", "timeout"]),
  message: z.string(),
});

export function createRequestTakeoverTool() {
  return defineTool({
    description:
      "Request to take over the Inspector from Human mode. " +
      "The user will see an approval dialog. Only works when the Inspector is in Human mode.",
    input: requestTakeoverInputSchema,
    output: requestTakeoverOutputSchema,
    handler: async (input) => {
      // Pre-check: must be in human mode
      if (getDashboardMode() !== "human") {
        return {
          requestId: "",
          status: "denied" as const,
          message: "Inspector is not in Human mode — takeover not needed.",
        };
      }

      // Submit the request
      let result: { requestId: string; status: string };
      try {
        result = requestTakeover(undefined, input.reason);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          requestId: "",
          status: "denied" as const,
          message: `Failed to request takeover: ${msg}`,
        };
      }

      const { requestId } = result;

      // Poll for resolution
      const deadline = Date.now() + TAKEOVER_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

        const status = getTakeoverStatus(requestId);
        if (status === "approved") {
          return {
            requestId,
            status: "approved" as const,
            message: "Takeover approved — Inspector is now in Agent mode.",
          };
        }
        if (status === "denied") {
          return {
            requestId,
            status: "denied" as const,
            message: "Takeover denied by the user.",
          };
        }
        if (status === "expired") {
          return {
            requestId,
            status: "timeout" as const,
            message: "Takeover request expired.",
          };
        }
        // still "pending" — keep polling
      }

      return {
        requestId,
        status: "timeout" as const,
        message: "Takeover request timed out — no response from the user within 30 seconds.",
      };
    },
  });
}
