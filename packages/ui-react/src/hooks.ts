/**
 * React hooks for @apps-builder/ui-react
 */

import { useState, useEffect, useCallback } from "react";
import type { AppsClient, HostContext, ToolDefs, ToolResult } from "@apps-builder/ui";
import { useAppsContext } from "./context";

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
export function useAppsClient<T extends ToolDefs = ToolDefs>(): AppsClient<T> {
  const { client, isConnecting, error } = useAppsContext<T>();

  if (error) {
    throw error;
  }

  if (isConnecting || !client) {
    throw new Error("Client not ready. Make sure AppsProvider has finished connecting.");
  }

  return client;
}

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
export function useToolResult<T extends ToolDefs = ToolDefs>(): ToolResult<T> | undefined {
  const { client } = useAppsContext<T>();
  const [result, setResult] = useState<ToolResult<T> | undefined>(undefined);

  useEffect(() => {
    if (!client) return;

    const unsubscribe = client.onToolResult((newResult) => {
      setResult(newResult as ToolResult<T>);
    });

    return unsubscribe;
  }, [client]);

  return result;
}

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
export function useToolInput(): Record<string, unknown> | undefined {
  const { client } = useAppsContext();
  const [input, setInput] = useState<Record<string, unknown> | undefined>(client?.toolInput);

  useEffect(() => {
    if (!client) return;

    const unsubscribe = client.onToolInput((newInput) => {
      setInput(newInput);
    });

    return unsubscribe;
  }, [client]);

  return input;
}

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
export function useHostContext(): HostContext {
  const { client } = useAppsContext();
  const [context, setContext] = useState<HostContext>(
    client?.hostContext ?? {
      theme: "light",
      displayMode: "inline",
      availableDisplayModes: ["inline"],
      viewport: { width: 0, height: 0 },
      locale: "en-US",
      platform: "web",
    }
  );

  useEffect(() => {
    if (!client) return;

    setContext(client.hostContext);

    const unsubscribe = client.onHostContextChange((newContext) => {
      setContext(newContext);
    });

    return unsubscribe;
  }, [client]);

  return context;
}

/**
 * Persisted widget state with automatic sync
 *
 * Works like useState but persists across widget reloads.
 * On ChatGPT: Session-scoped persistence
 * On MCP Apps: Silent no-op (returns default, setState is ignored)
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
export function useWidgetState<S>(defaultValue: S): [S, (newState: S | ((prev: S) => S)) => void] {
  const { client } = useAppsContext();

  const [state, setStateInternal] = useState<S>(() => {
    if (!client) return defaultValue;
    const stored = client.getState<S>();
    return stored ?? defaultValue;
  });

  const setState = useCallback(
    (newState: S | ((prev: S) => S)) => {
      setStateInternal((prev) => {
        const next = typeof newState === "function" ? (newState as (prev: S) => S)(prev) : newState;

        // Persist to client (silent no-op on MCP Apps)
        client?.setState(next);

        return next;
      });
    },
    [client]
  );

  return [state, setState];
}

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
export function useHostStyleVariables(): void {
  const context = useHostContext();

  useEffect(() => {
    const variables = context.styles?.variables;
    if (!variables) return;

    const root = document.documentElement;
    for (const [key, value] of Object.entries(variables)) {
      root.style.setProperty(key, value);
    }

    // Cleanup
    return () => {
      for (const key of Object.keys(variables)) {
        root.style.removeProperty(key);
      }
    };
  }, [context.styles?.variables]);
}

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
export function useDocumentTheme(lightClass = "light", darkClass = "dark"): void {
  const context = useHostContext();

  useEffect(() => {
    const { theme } = context;
    const body = document.body;

    body.classList.remove(lightClass, darkClass);
    body.classList.add(theme === "dark" ? darkClass : lightClass);

    return () => {
      body.classList.remove(lightClass, darkClass);
    };
  }, [context.theme, lightClass, darkClass]);
}

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
export function useDisplayMode(): {
  mode: string;
  availableModes: string[];
  requestMode: (mode: "inline" | "fullscreen" | "pip") => Promise<void>;
} {
  const context = useHostContext();
  const { client } = useAppsContext();

  const requestMode = useCallback(
    async (mode: "inline" | "fullscreen" | "pip") => {
      await client?.requestDisplayMode(mode);
    },
    [client]
  );

  return {
    mode: context.displayMode,
    availableModes: context.availableDisplayModes,
    requestMode,
  };
}

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
export function useSafeAreaInsets(): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  const context = useHostContext();

  return (
    context.safeAreaInsets ?? {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    }
  );
}

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
export function useOnToolCancelled(handler: (reason?: string) => void): void {
  const { client } = useAppsContext();

  useEffect(() => {
    if (!client) return;

    const unsubscribe = client.onToolCancelled(handler);
    return unsubscribe;
  }, [client, handler]);
}

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
export function useOnTeardown(handler: (reason?: string) => void): void {
  const { client } = useAppsContext();

  useEffect(() => {
    if (!client) return;

    const unsubscribe = client.onTeardown(handler);
    return unsubscribe;
  }, [client, handler]);
}
