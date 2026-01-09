/**
 * React context and provider for @mcp-apps-kit/ui-react
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
  type ComponentType,
} from "react";
import type { AppsClient, ToolDefs } from "@mcp-apps-kit/ui";
import { createClient } from "@mcp-apps-kit/ui";

// =============================================================================
// CONTEXT
// =============================================================================

// Internal context value - uses `unknown` for the client to allow any typed client
// The actual type parameter is applied when consuming via hooks
interface AppsContextValueInternal {
  client: AppsClient | null;
  isConnecting: boolean;
  error: Error | null;
}

const AppsContext = createContext<AppsContextValueInternal | null>(null);

// =============================================================================
// PROVIDER PROPS
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
   * Enable automatic size change notifications (MCP adapter only)
   *
   * When enabled, the UI automatically reports its size changes to the host
   * using a ResizeObserver on document.body and document.documentElement.
   * The host can then resize the UI container accordingly.
   *
   * Note: This option is only applied during initial mount. Changing it
   * at runtime will have no effect.
   *
   * @default true
   */
  autoResize?: boolean;

  /**
   * Fallback UI while client is connecting
   */
  fallback?: ReactNode;

  /**
   * Error boundary fallback
   */
  errorFallback?: ComponentType<{ error: Error; reset: () => void }>;
}

// =============================================================================
// PROVIDER
// =============================================================================

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
export function AppsProvider<T extends ToolDefs = ToolDefs>({
  children,
  client: providedClient,
  forceAdapter: _forceAdapter,
  autoResize,
  fallback,
  errorFallback: ErrorFallback,
}: AppsProviderProps<T>): React.JSX.Element {
  const [client, setClient] = useState<AppsClient<T> | null>(providedClient ?? null);
  const [isConnecting, setIsConnecting] = useState(!providedClient);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (providedClient) {
      setClient(providedClient);
      setIsConnecting(false);
      return;
    }

    // Initialize client with auto-detection or forced adapter
    const initClient = async () => {
      try {
        const newClient = await createClient<T>({
          forceAdapter: _forceAdapter,
          autoResize,
        });
        setClient(newClient);
        setIsConnecting(false);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsConnecting(false);
      }
    };

    void initClient();
    // Note: autoResize is intentionally not in the dependency array.
    // It should only be set during initial mount. Changing it at runtime
    // would cause unnecessary client re-initialization.
  }, [providedClient, _forceAdapter]);

  if (error && ErrorFallback) {
    return <ErrorFallback error={error} reset={() => setError(null)} />;
  }

  // Don't render children until client is connected
  // This prevents hooks from throwing during initial connection
  if (isConnecting) {
    return <>{fallback ?? null}</>;
  }

  // Cast to internal type - the generic T is preserved at runtime,
  // and consumers use hooks with their own type parameter to get proper typing
  const contextValue: AppsContextValueInternal = {
    client: client as AppsClient | null,
    isConnecting,
    error,
  };

  return <AppsContext.Provider value={contextValue}>{children}</AppsContext.Provider>;
}

// =============================================================================
// INTERNAL HOOK
// =============================================================================

/**
 * Context value exposed by useAppsContext
 */
export interface AppsContextValue<T extends ToolDefs = ToolDefs> {
  client: AppsClient<T> | null;
  isConnecting: boolean;
  error: Error | null;
}

/**
 * Internal hook to access the context
 * @internal
 */
export function useAppsContext<T extends ToolDefs = ToolDefs>(): AppsContextValue<T> {
  const context = useContext(AppsContext);
  if (!context) {
    throw new Error("useAppsContext must be used within an AppsProvider");
  }
  return context as AppsContextValue<T>;
}
