/**
 * get_console_logs tool
 *
 * Renders a tool's UI widget in a browser (Playwright) and captures all console messages.
 */

import { z } from "zod";
import { defineTool } from "@mcp-apps-kit/core";
import type { ConnectionManager } from "../connection";
import { UIHostManager, detectProtocolFromMimeType, type DetectedProtocol } from "../ui-host";

/**
 * Console message entry captured from the browser
 */
export interface ConsoleLogEntry {
  /** Log level (log, info, warn, error, debug) */
  level: "log" | "info" | "warn" | "error" | "debug";
  /** The message text */
  text: string;
  /** Source of the log (widget, host, or unknown) */
  source: "widget" | "host" | "unknown";
  /** Timestamp when the log was captured */
  timestamp: number;
  /** Optional URL where the log originated */
  url?: string;
  /** Optional line number */
  lineNumber?: number;
}

/**
 * Output from get_console_logs tool
 */
export interface GetConsoleLogsOutput {
  /** Whether the UI was rendered successfully */
  hasUI: boolean;
  /** Reason if no UI found */
  noUIReason?: string;
  /** Detected/used protocol */
  protocol?: "mcp" | "openai";
  /** Array of console log entries */
  logs: ConsoleLogEntry[];
  /** Summary counts by level */
  summary: {
    total: number;
    log: number;
    info: number;
    warn: number;
    error: number;
    debug: number;
  };
  /** Page errors (uncaught exceptions) */
  pageErrors: string[];
  /** Any errors during the process */
  errors: string[];
}

export const getConsoleLogsInputSchema = z.object({
  sessionId: z
    .string()
    .optional()
    .describe("Use existing widget session instead of creating new one"),
  tool: z.string().optional().describe("Name of the tool to render (required if no sessionId)"),
  arguments: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Arguments to pass to the tool (required if no sessionId)"),
  protocol: z
    .enum(["mcp", "openai", "auto"])
    .optional()
    .describe("Protocol to use (auto-detect if not specified)"),
  waitMs: z
    .number()
    .optional()
    .describe("Time to wait for widget to render and log before capturing (default: 500ms)"),
  viewport: z
    .object({
      width: z.number(),
      height: z.number(),
    })
    .optional()
    .describe("Viewport size (default: 800x600)"),
});

export const getConsoleLogsOutputSchema = z.object({
  hasUI: z.boolean(),
  noUIReason: z.string().optional(),
  protocol: z.enum(["mcp", "openai"]).optional(),
  logs: z.array(
    z.object({
      level: z.enum(["log", "info", "warn", "error", "debug"]),
      text: z.string(),
      source: z.enum(["widget", "host", "unknown"]),
      timestamp: z.number(),
      url: z.string().optional(),
      lineNumber: z.number().optional(),
    })
  ),
  summary: z.object({
    total: z.number(),
    log: z.number(),
    info: z.number(),
    warn: z.number(),
    error: z.number(),
    debug: z.number(),
  }),
  pageErrors: z.array(z.string()),
  errors: z.array(z.string()),
});

export function createGetConsoleLogsTool(connectionManager: ConnectionManager) {
  return defineTool({
    description:
      "Render a tool's UI widget in a browser and capture all console logs (log, info, warn, error, debug). Can use an existing session to get accumulated logs. Returns structured log entries with timestamps and sources.",
    input: getConsoleLogsInputSchema,
    output: getConsoleLogsOutputSchema,
    handler: async (input): Promise<GetConsoleLogsOutput> => {
      // Check if using existing session
      if (input.sessionId) {
        const sessionManager = connectionManager.getWidgetSessionManager();
        const session = sessionManager.getSession(input.sessionId);

        if (!session) {
          return {
            hasUI: false,
            noUIReason: `Session not found: ${input.sessionId}`,
            logs: [],
            summary: { total: 0, log: 0, info: 0, warn: 0, error: 0, debug: 0 },
            pageErrors: [],
            errors: [`Session ${input.sessionId} does not exist or has expired`],
          };
        }

        // Return accumulated logs from session
        const { consoleLogs, pageErrors, protocol } = session;

        // Calculate summary
        const summary = {
          total: consoleLogs.length,
          log: consoleLogs.filter((l) => l.level === "log").length,
          info: consoleLogs.filter((l) => l.level === "info").length,
          warn: consoleLogs.filter((l) => l.level === "warn").length,
          error: consoleLogs.filter((l) => l.level === "error").length,
          debug: consoleLogs.filter((l) => l.level === "debug").length,
        };

        return {
          hasUI: true,
          protocol,
          logs: consoleLogs,
          summary,
          pageErrors,
          errors: [],
        };
      }

      // Validate required fields for standalone mode
      if (!input.tool || !input.arguments) {
        return {
          hasUI: false,
          noUIReason: "Either sessionId or both tool and arguments must be provided",
          logs: [],
          summary: { total: 0, log: 0, info: 0, warn: 0, error: 0, debug: 0 },
          pageErrors: [],
          errors: ["Missing required parameters"],
        };
      }

      // Standalone mode: call tool and render widget
      const client = connectionManager.getClient();
      const rawClient = client.raw;

      const logs: ConsoleLogEntry[] = [];
      const pageErrors: string[] = [];
      const errors: string[] = [];

      // Step 1: Call the tool to get its result
      let toolResult: unknown;
      try {
        const callResult = await rawClient.callTool({
          name: input.tool,
          arguments: input.arguments,
        });

        // Extract structured content or parse from text
        if (callResult.structuredContent) {
          toolResult = callResult.structuredContent;
        } else if (
          callResult.content &&
          Array.isArray(callResult.content) &&
          callResult.content.length > 0
        ) {
          const textContent = callResult.content.find(
            (c: { type: string }) => c.type === "text"
          ) as { type: string; text?: string } | undefined;
          if (textContent?.text) {
            try {
              toolResult = JSON.parse(textContent.text);
            } catch {
              toolResult = textContent.text;
            }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          hasUI: false,
          noUIReason: `Tool call failed: ${message}`,
          logs: [],
          summary: { total: 0, log: 0, info: 0, warn: 0, error: 0, debug: 0 },
          pageErrors: [],
          errors: [message],
        };
      }

      // Step 2: Find the UI resource for this tool
      const resourcesResult = await rawClient.listResources();

      let uiResource: {
        uri: string;
        mimeType: string;
        protocol: DetectedProtocol;
      } | null = null;

      for (const resource of resourcesResult.resources) {
        const mimeType = resource.mimeType;
        if (!mimeType) continue;

        const protocol = detectProtocolFromMimeType(mimeType);
        if (!protocol) continue;

        // Check if URI matches tool name
        const toolNamePatterns = [
          `__ui_${input.tool}`,
          `/${input.tool}?`,
          `/${input.tool}`,
          `toolName=${input.tool}`,
        ];
        const uriMatchesTool = toolNamePatterns.some(
          (pattern) =>
            resource.uri.includes(pattern) || resource.uri.endsWith(pattern.replace("?", ""))
        );
        if (uriMatchesTool) {
          uiResource = {
            uri: resource.uri,
            mimeType,
            protocol,
          };
          break;
        }
      }

      if (!uiResource) {
        return {
          hasUI: false,
          noUIReason: `No UI resource found for tool: ${input.tool}`,
          logs: [],
          summary: { total: 0, log: 0, info: 0, warn: 0, error: 0, debug: 0 },
          pageErrors: [],
          errors: [],
        };
      }

      // Step 3: Determine protocol to use
      let protocol: DetectedProtocol = uiResource.protocol;
      if (input.protocol && input.protocol !== "auto") {
        protocol = input.protocol;
      }

      // Step 4: Fetch the widget HTML
      let html: string;
      try {
        const contentResult = await rawClient.readResource({ uri: uiResource.uri });
        html = "";
        for (const content of contentResult.contents) {
          if ("text" in content && typeof content.text === "string") {
            html += content.text;
          }
        }
        if (!html) {
          return {
            hasUI: false,
            noUIReason: `No HTML content in resource: ${uiResource.uri}`,
            logs: [],
            summary: { total: 0, log: 0, info: 0, warn: 0, error: 0, debug: 0 },
            pageErrors: [],
            errors: [],
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          hasUI: false,
          noUIReason: `Failed to fetch widget HTML: ${message}`,
          logs: [],
          summary: { total: 0, log: 0, info: 0, warn: 0, error: 0, debug: 0 },
          pageErrors: [],
          errors: [message],
        };
      }

      // Step 5: Render in browser and capture console logs
      const uiHostManager = new UIHostManager(client);
      const viewport = input.viewport ?? { width: 800, height: 600 };
      const waitMs = input.waitMs ?? 500;
      const environmentState = connectionManager.getEnvironmentState();

      try {
        const renderResult = await uiHostManager.renderInBrowser(
          html,
          protocol,
          toolResult,
          input.tool,
          environmentState,
          viewport
        );

        const { page } = renderResult;
        errors.push(...renderResult.errors);

        // Helper to convert console message type to our level
        const getLogLevel = (type: string): ConsoleLogEntry["level"] => {
          switch (type) {
            case "log":
              return "log";
            case "info":
              return "info";
            case "warning":
              return "warn";
            case "error":
              return "error";
            case "debug":
              return "debug";
            default:
              return "log";
          }
        };

        // Helper to determine source from URL
        const getSource = (url: string): ConsoleLogEntry["source"] => {
          if (url.includes("/widget/")) {
            return "widget";
          } else if (url.includes("/host/") || url.includes("host-page")) {
            return "host";
          }
          return "unknown";
        };

        // Set up console message listener BEFORE reload
        page.on("console", (msg) => {
          const location = msg.location();
          logs.push({
            level: getLogLevel(msg.type()),
            text: msg.text(),
            source: getSource(location.url),
            timestamp: Date.now(),
            url: location.url || undefined,
            lineNumber: location.lineNumber || undefined,
          });
        });

        // Set up page error listener (uncaught exceptions)
        page.on("pageerror", (err) => {
          pageErrors.push(err.message);
        });

        // Reload the page to capture all console logs from the beginning
        await page.reload({ waitUntil: "networkidle" });

        // Wait for widget to re-initialize and emit logs
        await page.waitForTimeout(waitMs);

        // Close the page
        await page.close();

        // Dispose of the browser pool
        await uiHostManager.dispose();

        // Calculate summary
        const summary = {
          total: logs.length,
          log: logs.filter((l) => l.level === "log").length,
          info: logs.filter((l) => l.level === "info").length,
          warn: logs.filter((l) => l.level === "warn").length,
          error: logs.filter((l) => l.level === "error").length,
          debug: logs.filter((l) => l.level === "debug").length,
        };

        return {
          hasUI: true,
          protocol,
          logs,
          summary,
          pageErrors,
          errors,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        // Clean up on error
        try {
          await uiHostManager.dispose();
        } catch {
          // Ignore cleanup errors
        }

        return {
          hasUI: true,
          protocol,
          logs,
          summary: {
            total: logs.length,
            log: logs.filter((l) => l.level === "log").length,
            info: logs.filter((l) => l.level === "info").length,
            warn: logs.filter((l) => l.level === "warn").length,
            error: logs.filter((l) => l.level === "error").length,
            debug: logs.filter((l) => l.level === "debug").length,
          },
          pageErrors,
          errors: [`Console capture failed: ${message}`],
        };
      }
    },
  });
}
