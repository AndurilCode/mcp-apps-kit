/**
 * InspectorModeContext
 *
 * Global React context for the dashboard mode ("human" | "agent").
 * Syncs with the backend `GET/PUT /dashboard/mode` endpoints on mount and on change.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useTakeoverStream } from "../hooks/useTakeoverStream";

// =============================================================================
// Types
// =============================================================================

export type DashboardMode = "human" | "agent";

export interface TakeoverRequest {
  id: string;
  agentId?: string;
  reason?: string;
  timestamp: number;
}

export interface InspectorModeState {
  /** Current dashboard mode */
  mode: DashboardMode;
  /** Switch mode (syncs with backend) */
  setMode: (mode: DashboardMode) => void;
  /** Pending agent takeover request (Phase 6) */
  takeoverRequest: TakeoverRequest | null;
  /** Respond to a pending takeover request (Phase 6) */
  respondToTakeover: (allow: boolean) => void;
}

// =============================================================================
// Context
// =============================================================================

const InspectorModeContext = createContext<InspectorModeState | null>(null);

// =============================================================================
// Provider
// =============================================================================

export interface InspectorModeProviderProps {
  /** Base URL for the inspector API */
  baseUrl: string;
  children: React.ReactNode;
}

export function InspectorModeProvider({
  baseUrl,
  children,
}: InspectorModeProviderProps): React.ReactElement {
  const [mode, setModeLocal] = useState<DashboardMode>("agent");

  // Subscribe to takeover SSE stream
  const { pendingRequest } = useTakeoverStream(baseUrl);

  // Sync initial mode from backend on mount
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`${baseUrl}/dashboard/mode`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = (await res.json()) as { mode: DashboardMode };
          setModeLocal(data.mode);
        }
      } catch {
        // Ignore fetch errors on mount (e.g. abort, network)
      }
    })();
    return () => controller.abort();
  }, [baseUrl]);

  // Set mode: sync with backend, then update local state
  const setMode = useCallback(
    (newMode: DashboardMode) => {
      void (async () => {
        try {
          const res = await fetch(`${baseUrl}/dashboard/mode`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: newMode }),
          });
          if (res.ok) {
            const data = (await res.json()) as { mode: DashboardMode };
            setModeLocal(data.mode);
          }
        } catch {
          // Ignore fetch errors — mode stays unchanged
        }
      })();
    },
    [baseUrl]
  );

  // Respond to a pending takeover request via backend
  const respondToTakeover = useCallback(
    (allow: boolean) => {
      if (!pendingRequest) return;
      void (async () => {
        try {
          const res = await fetch(`${baseUrl}/dashboard/takeover-response`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requestId: pendingRequest.id, allow }),
          });
          if (res.ok) {
            const data = (await res.json()) as { mode: DashboardMode };
            setModeLocal(data.mode);
          }
        } catch {
          // Ignore fetch errors
        }
      })();
    },
    [pendingRequest, baseUrl]
  );

  const value: InspectorModeState = {
    mode,
    setMode,
    takeoverRequest: pendingRequest,
    respondToTakeover,
  };

  return <InspectorModeContext.Provider value={value}>{children}</InspectorModeContext.Provider>;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Access the current inspector mode and controls.
 *
 * Must be used inside an `<InspectorModeProvider>`.
 */
export function useInspectorMode(): InspectorModeState {
  const ctx = useContext(InspectorModeContext);
  if (!ctx) {
    throw new Error("useInspectorMode must be used within an InspectorModeProvider");
  }
  return ctx;
}
