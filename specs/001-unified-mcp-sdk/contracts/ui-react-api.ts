/**
 * @mcp-apps-kit/ui-react API Contract
 *
 * This file defines the public API surface for the React bindings package.
 * All exports listed here MUST be implemented and tested.
 */

import type { ReactNode, ComponentType } from "react";
import type { ToolDefs } from "./core-api";
import type { AppsClient, HostContext, ToolResult } from "./ui-api";

// =============================================================================
// CONTEXT PROVIDER
// =============================================================================

/**
 * Props for AppsProvider
 */
export interface AppsProviderProps<T extends ToolDefs = ToolDefs> {
  /** Child components */
  children: ReactNode;

  /**
   * Pre-created client instance (optional)
   * If not provided, creates client automatically
   */
  client?: AppsClient<T>;

  /**
   * Force a specific protocol adapter
   */
  forceAdapter?: "mcp" | "openai" | "mock";

  /**
   * Fallback UI while client is connecting
   */
  fallback?: ReactNode;

  /**
   * Error boundary fallback
   */
  errorFallback?: ComponentType<{ error: Error; reset: () => void }>;
}

/**
 * Context provider for mcp-apps-kit React integration
 *
 * Wraps your app and provides the client instance to all hooks.
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <AppsProvider fallback={<Loading />}>
 *       <MyWidget />
 *     </AppsProvider>
 *   );
 * }
 * ```
 */
export declare function AppsProvider<T extends ToolDefs = ToolDefs>(
  props: AppsProviderProps<T>
): JSX.Element;

// =============================================================================
// CORE HOOKS
// =============================================================================

/**
 * Access the typed client instance
 *
 * @returns Client instance
 * @throws Error if used outside AppsProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const client = useAppsClient<typeof app.tools>();
 *
 *   const handleClick = async () => {
 *     await client.callTool("myTool", { arg: "value" });
 *   };
 *
 *   return <button onClick={handleClick}>Call Tool</button>;
 * }
 * ```
 */
export declare function useAppsClient<
  T extends ToolDefs = ToolDefs
>(): AppsClient<T>;

/**
 * Access current tool result with automatic re-renders
 *
 * @returns Current tool result or undefined
 *
 * @example
 * ```tsx
 * function ResultDisplay() {
 *   const result = useToolResult<typeof app.tools>();
 *
 *   if (!result?.myTool) {
 *     return <div>No results yet</div>;
 *   }
 *
 *   return <div>{result.myTool.message}</div>;
 * }
 * ```
 */
export declare function useToolResult<
  T extends ToolDefs = ToolDefs
>(): ToolResult<T> | undefined;

/**
 * Access current tool input
 *
 * @returns Current tool input or undefined
 *
 * @example
 * ```tsx
 * function InputDisplay() {
 *   const input = useToolInput();
 *   return <pre>{JSON.stringify(input, null, 2)}</pre>;
 * }
 * ```
 */
export declare function useToolInput(): Record<string, unknown> | undefined;

/**
 * Access host context with automatic re-renders on changes
 *
 * @returns Current host context
 *
 * @example
 * ```tsx
 * function ThemedComponent() {
 *   const context = useHostContext();
 *
 *   return (
 *     <div className={context.theme}>
 *       Display: {context.displayMode}
 *     </div>
 *   );
 * }
 * ```
 */
export declare function useHostContext(): HostContext;

/**
 * Persisted widget state with automatic sync
 *
 * Works like useState but persists across widget reloads.
 *
 * @param defaultValue - Initial state value
 * @returns [state, setState] tuple
 *
 * @example
 * ```tsx
 * function Counter() {
 *   const [count, setCount] = useWidgetState(0);
 *
 *   return (
 *     <button onClick={() => setCount(c => c + 1)}>
 *       Count: {count}
 *     </button>
 *   );
 * }
 * ```
 */
export declare function useWidgetState<S>(
  defaultValue: S
): [S, (newState: S | ((prev: S) => S)) => void];

// =============================================================================
// UTILITY HOOKS
// =============================================================================

/**
 * Apply host CSS variables to document root
 *
 * Call this once in your root component to apply host theming.
 *
 * @example
 * ```tsx
 * function App() {
 *   useHostStyleVariables();
 *   return <MyWidget />;
 * }
 * ```
 */
export declare function useHostStyleVariables(): void;

/**
 * Apply theme class to document body
 *
 * @param lightClass - Class name for light theme (default: "light")
 * @param darkClass - Class name for dark theme (default: "dark")
 *
 * @example
 * ```tsx
 * function App() {
 *   useDocumentTheme("theme-light", "theme-dark");
 *   return <MyWidget />;
 * }
 * ```
 */
export declare function useDocumentTheme(
  lightClass?: string,
  darkClass?: string
): void;

/**
 * Access and manage display mode
 *
 * @returns Display mode state and controls
 *
 * @example
 * ```tsx
 * function DisplayModeToggle() {
 *   const { mode, availableModes, requestMode } = useDisplayMode();
 *
 *   return (
 *     <select value={mode} onChange={e => requestMode(e.target.value)}>
 *       {availableModes.map(m => (
 *         <option key={m} value={m}>{m}</option>
 *       ))}
 *     </select>
 *   );
 * }
 * ```
 */
export declare function useDisplayMode(): {
  mode: string;
  availableModes: string[];
  requestMode: (mode: "inline" | "fullscreen" | "pip") => Promise<void>;
};

/**
 * Access safe area insets for mobile layouts
 *
 * @returns Safe area insets or default zeros
 *
 * @example
 * ```tsx
 * function SafeContent() {
 *   const insets = useSafeAreaInsets();
 *
 *   return (
 *     <div style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
 *       Content
 *     </div>
 *   );
 * }
 * ```
 */
export declare function useSafeAreaInsets(): {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

// =============================================================================
// EVENT HOOKS
// =============================================================================

/**
 * Subscribe to tool cancellation
 *
 * @param handler - Callback when tool is cancelled
 *
 * @example
 * ```tsx
 * function CancellableOperation() {
 *   const [cancelled, setCancelled] = useState(false);
 *
 *   useOnToolCancelled((reason) => {
 *     setCancelled(true);
 *     console.log("Cancelled:", reason);
 *   });
 *
 *   return cancelled ? <div>Cancelled</div> : <div>Running...</div>;
 * }
 * ```
 */
export declare function useOnToolCancelled(
  handler: (reason?: string) => void
): void;

/**
 * Subscribe to teardown events
 *
 * @param handler - Callback when widget is torn down
 *
 * @example
 * ```tsx
 * function CleanupComponent() {
 *   useOnTeardown((reason) => {
 *     console.log("Tearing down:", reason);
 *     // Cleanup resources
 *   });
 *
 *   return <div>Widget</div>;
 * }
 * ```
 */
export declare function useOnTeardown(handler: (reason?: string) => void): void;

// =============================================================================
// RE-EXPORTS
// =============================================================================

// Re-export types from ui package for convenience
export type { HostContext, ToolResult, AppsClient } from "./ui-api";
