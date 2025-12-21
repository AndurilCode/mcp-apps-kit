/**
 * React context and provider for @apps-builder/ui-react
 */

import { createContext, useContext, useState, useEffect, type ReactNode, type ComponentType } from "react";
import type { AppsClient, ToolDefs } from "@apps-builder/ui";

// =============================================================================
// CONTEXT
// =============================================================================

interface AppsContextValue<T extends ToolDefs = ToolDefs> {
  client: AppsClient<T> | null;
  isConnecting: boolean;
  error: Error | null;
}

const AppsContext = createContext<AppsContextValue | null>(null);

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
 * Context provider for apps-builder React integration
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
  fallback,
  errorFallback: ErrorFallback,
}: AppsProviderProps<T>): JSX.Element {
  const [client, setClient] = useState<AppsClient<T> | null>(providedClient ?? null);
  const [isConnecting, setIsConnecting] = useState(!providedClient);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (providedClient) {
      setClient(providedClient);
      setIsConnecting(false);
      return;
    }

    // Will be implemented in Phase 5
    const initClient = async () => {
      try {
        // Placeholder - createClient will be called here
        setIsConnecting(false);
        setError(new Error("Client initialization not implemented yet - Phase 5"));
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsConnecting(false);
      }
    };

    void initClient();
  }, [providedClient]);

  if (error && ErrorFallback) {
    return <ErrorFallback error={error} reset={() => setError(null)} />;
  }

  if (isConnecting && fallback) {
    return <>{fallback}</>;
  }

  return (
    <AppsContext.Provider value={{ client, isConnecting, error }}>
      {children}
    </AppsContext.Provider>
  );
}

// =============================================================================
// INTERNAL HOOK
// =============================================================================

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
