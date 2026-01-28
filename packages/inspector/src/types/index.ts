/**
 * Types Index
 *
 * Barrel export for all inspector types.
 * This allows importing all types from a single location.
 */

// Server types (MCP server interface, target schema, options)
export type {
  ResourceMetadata,
  ResourceContents,
  ToolCallResult,
  McpServerLike,
  TargetToolInfo,
  TargetResourceInfo,
  TargetPromptInfo,
  TargetServerSchema,
  ServerInfo,
  InspectorServerOptions,
} from "./server-types";

// Connection types (state, options, tool inputs/outputs)
export type {
  ConnectOptions,
  ConnectionState,
  ConnectInput,
  ConnectOutput,
  DisconnectOutput,
  ConnectionStatusOutput,
} from "./connection-types";

// Tool types (tool, resource, prompt operations)
export type {
  ToolHints,
  ToolInfo,
  CallToolInput,
  ContentBlock,
  CallToolOutput,
  ResourceInfo,
  ReadResourceInput,
  ReadResourceOutput,
  PromptInfo,
  GetPromptInput,
  PromptMessage,
  GetPromptOutput,
} from "./tool-types";

// History types (call history tracking)
export type { HistoryEntry, HistoryOutput, ClearHistoryOutput } from "./history-types";

// Test types (test suite definition and execution)
export type {
  TestCaseInput,
  TestSuiteInput,
  RunTestSuiteInput,
  TestCaseResultOutput,
  RunTestSuiteOutput,
} from "./test-types";

// UI types (widget inspection, preview, rendering, control)
export type {
  UIProtocol,
  UIWidgetInfo,
  ListUIWidgetsOutput,
  GetUIWidgetInput,
  UIWidgetCSP,
  UIWidgetMetadata,
  GetUIWidgetOutput,
  InspectToolUIInput,
  UIBinding,
  InspectToolUIOutput,
  GetUIMetadataInput,
  GetUIMetadataOutput,
  ElementInfo,
  PreviewUIInput,
  PreviewUIOutput,
  ScreenshotWidgetInput,
  ScreenshotWidgetOutput,
  InteractionAction,
  TestWidgetInteractionInput,
  TestWidgetInteractionOutput,
  ConsoleLogEntry,
  GetConsoleLogsInput,
  GetConsoleLogsOutput,
  WidgetEvaluateInput,
  WidgetEvaluateOutput,
  WidgetClickInput,
  WidgetClickOutput,
  WidgetFillInput,
  WidgetFillOutput,
  WidgetDragOutput,
  TrackedDialog,
  WidgetRefreshOutput,
  WidgetWaitForSelectorInput,
  WidgetWaitForSelectorOutput,
  WidgetLocatorInput,
  LocatorElementInfo,
  WidgetLocatorOutput,
  GetWidgetStateInput,
  WidgetToolCall,
  WidgetStateChange,
  WidgetDOMSnapshot,
  WidgetStateSnapshot,
  GetWidgetStateOutput,
  AccessibilityNode,
  InteractiveElementSummary,
  WidgetSnapshotInput,
  WidgetSnapshotOutput,
  SemanticLocatorOptions,
  WaitForStabilityOptions,
  WidgetQueryInput,
  QueryElementInfo,
  WidgetQueryOutput,
  ElementChange,
  WidgetSnapshotDiffInput,
  WidgetSnapshotDiffOutput,
  CountChange,
  SnapshotDiffSummary,
} from "./ui-types";

// Environment types (state, globals, sync events)
export type {
  DeviceType,
  DeviceCapabilitiesInfo,
  UserAgentInfo,
  UserLocationInfo,
  SafeAreaInsetsInfo,
  ViewportInfo,
  EnvironmentState,
  SetGlobalsInput,
  SetGlobalsOutput,
  GetGlobalsOutput,
  ResetGlobalsOutput,
  SyncEventPayload,
  DisplayModeSizing,
  DisplayModePlatform,
  DisplayMode,
} from "./environment-types";

// Re-export SyncEventType as a value (it's a union type alias, needs special handling)
export { type SyncEventType } from "./environment-types";

// Export display mode sizing utilities
export {
  DISPLAY_MODE_SIZES,
  getDisplayModeSizing,
  getPlatformFromDeviceType,
} from "./environment-types";

// DOM sync types (DOM interaction synchronization)
export type {
  DomClickPayload,
  DomInputPayload,
  DomScrollPayload,
  DomFocusPayload,
  DomKeyModifiers,
  DomKeyPayload,
  DomSelectPayload,
  DomDragPayload,
  DomSyncEventType,
  DomEventPayload,
} from "./dom-sync-types";

export { isDomSyncEventType } from "./dom-sync-types";

// Inspector event types (for dashboard events panel)
export type {
  EventCategory,
  InspectorEventType,
  InspectorEvent,
  AgnosticInspectorEvent,
} from "./inspector-event-types";

export { getEventCategory, getEventSummary } from "./inspector-event-types";
