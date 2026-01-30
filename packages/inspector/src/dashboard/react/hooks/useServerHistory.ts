/**
 * useServerHistory Hook
 *
 * Manages server connection history persisted in localStorage.
 * Stores URLs, protocol types, connection timestamps, and server names.
 */

import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "mcp-inspector-server-history";
const MAX_ENTRIES = 10;

export type ProtocolType = "chatgpt-apps" | "mcp-apps" | "mcp";

export interface ServerHistoryEntry {
  url: string;
  protocolType: ProtocolType;
  lastConnected: number;
  name?: string;
  /** Transport type — defaults to HTTP when absent (backward compat). */
  transport?: "http" | "stdio";
  /** stdio command (only when transport === "stdio"). */
  command?: string;
  /** stdio args (only when transport === "stdio"). */
  args?: string[];
}

export interface UseServerHistoryResult {
  history: ServerHistoryEntry[];
  addEntry: (entry: Omit<ServerHistoryEntry, "lastConnected">) => void;
  removeEntry: (url: string) => void;
  clearHistory: () => void;
  getMatchingEntries: (filter: string) => ServerHistoryEntry[];
}

/**
 * Load history from localStorage
 */
function loadHistory(): ServerHistoryEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored) as unknown[];
    const validProtocolTypes: ProtocolType[] = ["chatgpt-apps", "mcp-apps", "mcp"];
    // Validate and filter entries
    return parsed
      .filter(
        (entry): entry is ServerHistoryEntry =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as ServerHistoryEntry).url === "string" &&
          typeof (entry as ServerHistoryEntry).protocolType === "string" &&
          validProtocolTypes.includes((entry as ServerHistoryEntry).protocolType) &&
          typeof (entry as ServerHistoryEntry).lastConnected === "number"
      )
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

/**
 * Save history to localStorage
 */
function saveHistory(history: ServerHistoryEntry[]): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_ENTRIES)));
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Hook to manage server connection history
 */
export function useServerHistory(): UseServerHistoryResult {
  const [history, setHistory] = useState<ServerHistoryEntry[]>(() => loadHistory());

  // Sync to localStorage when history changes
  useEffect(() => {
    saveHistory(history);
  }, [history]);

  const addEntry = useCallback((entry: Omit<ServerHistoryEntry, "lastConnected">) => {
    setHistory((prev) => {
      // Remove existing entry matching the same connection target
      const argsEqual = (a?: string[], b?: string[]): boolean => {
        if (!a?.length && !b?.length) return true;
        if (!a?.length || !b?.length || a.length !== b.length) return false;
        return a.every((v, i) => v === b[i]);
      };

      const filtered =
        entry.transport === "stdio"
          ? prev.filter(
              (e) =>
                !(
                  e.transport === "stdio" &&
                  e.command === entry.command &&
                  argsEqual(e.args, entry.args)
                )
            )
          : prev.filter((e) => e.url !== entry.url);

      const newEntry: ServerHistoryEntry = {
        ...entry,
        lastConnected: Date.now(),
      };

      return [newEntry, ...filtered].slice(0, MAX_ENTRIES);
    });
  }, []);

  const removeEntry = useCallback((url: string) => {
    setHistory((prev) => prev.filter((e) => e.url !== url));
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  const getMatchingEntries = useCallback(
    (filter: string): ServerHistoryEntry[] => {
      if (!filter) return history;
      const lowerFilter = filter.toLowerCase();
      return history.filter((entry) => {
        if (entry.url.toLowerCase().includes(lowerFilter)) return true;
        if (entry.name?.toLowerCase().includes(lowerFilter)) return true;
        if (entry.command?.toLowerCase().includes(lowerFilter)) return true;
        if (entry.args?.some((a) => a.toLowerCase().includes(lowerFilter))) return true;
        return false;
      });
    },
    [history]
  );

  return {
    history,
    addEntry,
    removeEntry,
    clearHistory,
    getMatchingEntries,
  };
}

export default useServerHistory;
