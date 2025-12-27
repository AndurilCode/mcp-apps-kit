/**
 * @mcp-apps-kit/ui-react
 *
 * React bindings for MCP applications.
 */

// Re-export types from @mcp-apps-kit/ui
export type { HostContext, ToolResult, AppsClient } from "@mcp-apps-kit/ui";

// Context (placeholder - will be implemented in Phase 6)
export { AppsProvider } from "./context";
export type { AppsProviderProps } from "./context";

// Hooks (placeholder - will be implemented in Phase 6)
export {
  useAppsClient,
  useToolResult,
  useToolInput,
  useHostContext,
  useWidgetState,
  useHostStyleVariables,
  useDocumentTheme,
  useDisplayMode,
  useSafeAreaInsets,
  useOnToolCancelled,
  useOnTeardown,
  // File operations (ChatGPT only)
  useFileUpload,
  useFileDownload,
  // Layout (ChatGPT only)
  useIntrinsicHeight,
  useView,
  // Modals (ChatGPT only)
  useModal,
  // Debug logging
  useDebugLogger,
} from "./hooks";

// File operation types
export type { FileUploadResult, UseFileUploadState } from "./hooks";

// Re-export modal types from @mcp-apps-kit/ui
export type { ModalButton, ModalInput, ModalOptions, ModalResult } from "@mcp-apps-kit/ui";

// Re-export debug logger types from @mcp-apps-kit/ui
export type { ClientDebugConfig, ClientDebugLogger } from "@mcp-apps-kit/ui";
