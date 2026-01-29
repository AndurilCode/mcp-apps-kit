/**
 * Connection Types
 *
 * Types for connection state, options, and related tool inputs/outputs.
 */

import type { TestClient } from "@mcp-apps-kit/testing";
import type { ServerInfo } from "./server-types";

// =============================================================================
// CONNECTION TYPES
// =============================================================================

/**
 * Options for connecting to a target server
 */
export interface ConnectOptions {
  /** Track call history. Default: true */
  trackHistory?: boolean;

  /** Connection timeout in ms. Default: 30000 */
  timeout?: number;
}

/**
 * Connection state
 */
export interface ConnectionState {
  /** Whether connected to a target server */
  connected: boolean;

  /** URL of the connected server */
  serverUrl: string | null;

  /** Server info from the connected server */
  serverInfo: ServerInfo | null;

  /** Whether history tracking is enabled */
  historyEnabled: boolean;

  /** Number of calls made */
  callCount: number;

  /** The test client (if connected) */
  client: TestClient | null;
}

/**
 * Input for connect_to_server tool
 */
export interface ConnectInput {
  url: string;
  options?: ConnectOptions;
}

/**
 * Output from connect_to_server tool
 */
export interface ConnectOutput {
  connected: boolean;
  serverUrl: string;
  serverInfo: ServerInfo | null;
  toolCount: number;
  resourceCount: number;
  promptCount: number;
}

/**
 * Output from disconnect tool
 */
export interface DisconnectOutput {
  disconnected: boolean;
  previousUrl: string | null;
}

/**
 * Output from get_connection_status
 */
export interface ConnectionStatusOutput {
  connected: boolean;
  serverUrl: string | null;
  serverInfo: ServerInfo | null;
  historyEnabled: boolean;
  callCount: number;
}
