/**
 * @apps-builder/ui-react
 *
 * React bindings for MCP applications.
 */

// Re-export types from @apps-builder/ui
export type { HostContext, ToolResult, AppsClient } from "@apps-builder/ui";

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
} from "./hooks";
