/**
 * Widget Session Types
 *
 * Core interface for widget rendering sessions. A WidgetSession represents
 * an active widget being rendered in a Playwright page instance.
 */

import type { Frame, Page } from "playwright";
import type { ConsoleLogEntry } from "../tools/get-console-logs";
import type { DetectedProtocol } from "../ui-host";
import type { InspectorEvent, TrackedDialog, WidgetToolCall } from "../types";
import type { WidgetFrameHandle } from "../types/widget-frame-handle";

/**
 * Source endpoint that created the session
 */
export type SessionSource = "apps" | "agent";

/**
 * Proxy metadata for sessions created via /apps/mcp proxy
 */
export interface ProxyMetadata {
  /** URL of the target server being proxied */
  targetServerUrl: string;
  /** Original tool name on target server */
  targetToolName: string;
}

/**
 * Core widget session interface
 *
 * This is the minimal session structure for session management.
 * Extended by ActiveWidgetSession for full functionality.
 */
export interface WidgetSession {
  /** Unique session ID */
  sessionId: string;
  /** Tool name that was called */
  toolName: string;
  /** Protocol used (mcp or openai) */
  protocol: DetectedProtocol;
  /** Playwright page instance */
  page: Page;
  /** Widget iframe within the page (null if not yet loaded) */
  frame: Frame | null;
  /** When the session was created */
  createdAt: number;
  /** When the session was last accessed (for TTL reset) */
  lastAccessedAt: number;
  /** Global state pushed to widget */
  globals?: Record<string, unknown>;
  /** Accumulated inspector events */
  events?: Array<{ type: string; timestamp: number; data?: unknown }>;
}

/**
 * Full active widget session with all tracking data
 *
 * Extends WidgetSession with console logs, errors, dialogs, tool calls,
 * and other tracking needed for the inspector dashboard.
 */
export interface ActiveWidgetSession extends Omit<WidgetSession, "sessionId" | "frame" | "events"> {
  /** Unique session ID (same as WidgetServer session ID for unified lookup) */
  id: string;
  /** Arguments passed to the tool */
  toolArgs: Record<string, unknown>;
  /** Result returned by the tool */
  toolResult: unknown;
  /** Accumulated console logs */
  consoleLogs: ConsoleLogEntry[];
  /** Accumulated page errors */
  pageErrors: string[];
  /** Tracked dialogs (alert, confirm, prompt) that were auto-handled */
  dialogs: TrackedDialog[];
  /** Tool calls made by the widget (with results from /execute-tool) */
  toolCalls: WidgetToolCall[];
  /** Which endpoint created this session (apps = ChatGPT proxy, agent = inspector tools) */
  source: SessionSource;
  /** Metadata for proxy sessions (when source is 'apps') */
  proxyMetadata?: ProxyMetadata;
  /** Last captured accessibility tree snapshot (for widget_snapshot_diff auto-comparison) */
  lastSnapshot?: unknown;
  /** Timestamp when lastSnapshot was captured */
  lastSnapshotTimestamp?: number;
  /** Optional callback to keep external session (WidgetServer) alive when this session is touched */
  onTouch?: () => void;
  /** WidgetFrameHandle for interactive mode (dashboard iframe). When set, tools use handle instead of raw page. */
  handle?: WidgetFrameHandle;
  /** Accumulated inspector events (for dashboard events panel) */
  events: InspectorEvent[];
}

/**
 * Session info for listing (minimal data for API responses)
 */
export interface SessionInfo {
  id: string;
  toolName: string;
  protocol: DetectedProtocol;
  createdAt: number;
  /** When the session was last accessed (for TTL tracking) */
  lastAccessedAt: number;
  logCount: number;
  errorCount: number;
  /** Count of auto-handled dialogs */
  dialogCount: number;
  /** Which endpoint created this session */
  source: SessionSource;
}
