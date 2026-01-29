/**
 * useGlobals Hook
 *
 * Polls the inspector backend for current environment/globals state.
 */

import { useState, useEffect, useCallback, useRef } from "react";

export interface ViewportInfo {
  width: number;
  height: number;
}

export interface SafeAreaInsetsInfo {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface DeviceType {
  type?: string;
}

export interface DeviceCapabilitiesInfo {
  hover?: boolean;
  touch?: boolean;
}

export interface UserAgentInfo {
  device?: DeviceType;
  capabilities?: DeviceCapabilitiesInfo;
}

export interface UserLocationInfo {
  city?: string;
  region?: string;
  country?: string;
  timezone?: string;
}

export interface GlobalsState {
  theme: "light" | "dark";
  locale: string;
  timeZone: string;
  displayMode: "inline" | "fullscreen" | "pip";
  viewport: ViewportInfo;
  maxHeight?: number;
  safeAreaInsets: SafeAreaInsetsInfo;
  userAgent: UserAgentInfo;
  userLocation?: UserLocationInfo;
}

interface GlobalsResponse {
  globals?: GlobalsState;
}

export interface UseGlobalsResult {
  globals: GlobalsState | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const defaultGlobals: GlobalsState = {
  theme: "light",
  locale: "en-US",
  timeZone: "UTC",
  displayMode: "inline",
  viewport: { width: 800, height: 600 },
  safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
  userAgent: {
    device: { type: "desktop" },
    capabilities: { hover: true, touch: false },
  },
};

export function useGlobals(baseUrl: string, pollInterval = 2000): UseGlobalsResult {
  const [globals, setGlobals] = useState<GlobalsState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchGlobals = useCallback(async () => {
    // Abort any previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch(`${baseUrl}/dashboard/globals`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as GlobalsResponse;
      setGlobals(data.globals ?? defaultGlobals);
      setError(null);
    } catch (e) {
      // Skip state updates for aborted requests
      if (e instanceof Error && e.name === "AbortError") {
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to fetch globals");
    } finally {
      // Only update loading state if this request wasn't aborted
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [baseUrl]);

  useEffect(() => {
    void fetchGlobals();
    const interval = setInterval(() => {
      void fetchGlobals();
    }, pollInterval);
    return () => {
      clearInterval(interval);
      // Abort any in-flight request on cleanup
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchGlobals, pollInterval]);

  return { globals, isLoading, error, refresh: fetchGlobals };
}
