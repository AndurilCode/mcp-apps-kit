/**
 * ConnectionBar Component
 *
 * Browser-style URL connection bar for connecting to MCP servers.
 * Features:
 * - URL input with autocomplete from server history
 * - Protocol badge display (ChatGPT Apps, MCP Apps, or none)
 * - Connect/Disconnect controls
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { ServerHistoryEntry } from "../hooks";

export interface ConnectionBarProps {
  isOpen: boolean;
  isCreating: boolean;
  error: string | null;
  onCreateConnection: (url: string) => Promise<boolean>;
  onClose: () => void;
  getMatchingEntries: (filter: string) => ServerHistoryEntry[];
}

// Connection bar styles (extends base styles)
const connectionBarStyles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    alignItems: "center",
    flex: 1,
    maxWidth: "600px",
    marginLeft: "1rem",
    marginRight: "1rem",
    position: "relative",
  },
  inputWrapper: {
    display: "flex",
    alignItems: "center",
    flex: 1,
    backgroundColor: "#111111",
    border: "1px solid #2d2f2f",
    borderRadius: "8px",
    overflow: "hidden",
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
  },
  inputWrapperFocused: {
    borderColor: "#20b2aa",
    boxShadow: "0 0 0 2px rgba(32, 178, 170, 0.2)",
  },
  inputWrapperError: {
    borderColor: "#ef4444",
    boxShadow: "0 0 0 2px rgba(239, 68, 68, 0.2)",
  },
  protocolBadge: {
    display: "flex",
    alignItems: "center",
    padding: "0.25rem 0.5rem",
    fontSize: "0.625rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.02em",
    borderRadius: "4px",
    marginLeft: "0.5rem",
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
  badgeChatgptApps: {
    backgroundColor: "rgba(32, 178, 170, 0.15)",
    color: "#20b2aa",
  },
  badgeMcpApps: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    color: "#3b82f6",
  },
  urlInput: {
    flex: 1,
    backgroundColor: "transparent",
    border: "none",
    color: "#e8e8e8",
    padding: "0.5rem 0.75rem",
    fontSize: "0.8125rem",
    fontFamily: "inherit",
    outline: "none",
    minWidth: "200px",
  },
  actionButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0.5rem 0.75rem",
    backgroundColor: "transparent",
    border: "none",
    cursor: "pointer",
    color: "#6b7280",
    transition: "color 0.15s ease, background-color 0.15s ease",
    borderLeft: "1px solid #2d2f2f",
    flexShrink: 0,
  },
  connectButton: {
    color: "#20b2aa",
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  closeButton: {
    color: "#9aa0a6",
    borderLeft: "1px solid #2d2f2f",
  },
  dropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: "4px",
    backgroundColor: "#111111",
    border: "1px solid #2d2f2f",
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
    zIndex: 100,
    maxHeight: "200px",
    overflowY: "auto",
  },
  dropdownItem: {
    display: "flex",
    alignItems: "center",
    padding: "0.5rem 0.75rem",
    cursor: "pointer",
    transition: "background-color 0.1s ease",
    gap: "0.5rem",
  },
  dropdownItemHover: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  dropdownItemUrl: {
    flex: 1,
    fontSize: "0.75rem",
    color: "#e8e8e8",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  dropdownItemName: {
    fontSize: "0.6875rem",
    color: "#6b7280",
  },
  dropdownItemBadge: {
    fontSize: "0.5625rem",
    padding: "0.125rem 0.25rem",
    borderRadius: "3px",
    fontWeight: 600,
    textTransform: "uppercase",
    flexShrink: 0,
  },
  loadingSpinner: {
    width: "14px",
    height: "14px",
    border: "2px solid #2d2f2f",
    borderTopColor: "#20b2aa",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  errorTooltip: {
    position: "absolute",
    top: "100%",
    left: "50%",
    transform: "translateX(-50%)",
    marginTop: "8px",
    padding: "0.5rem 0.75rem",
    backgroundColor: "rgba(239, 68, 68, 0.9)",
    color: "#ffffff",
    fontSize: "0.75rem",
    borderRadius: "6px",
    whiteSpace: "nowrap",
    zIndex: 101,
  },
};

/**
 * ConnectionBar Component
 */
export function ConnectionBar({
  isOpen,
  isCreating,
  error,
  onCreateConnection,
  onClose,
  getMatchingEntries,
}: ConnectionBarProps): React.ReactElement {
  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Get filtered history entries based on input
  const filteredHistory = useMemo(() => {
    if (!inputValue && !isFocused) return [];
    return getMatchingEntries(inputValue);
  }, [inputValue, isFocused, getMatchingEntries]);

  // Show dropdown when focused and there are entries
  useEffect(() => {
    setShowDropdown(isFocused && filteredHistory.length > 0);
  }, [isFocused, filteredHistory.length]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!inputValue.trim() || isCreating) return;
    const created = await onCreateConnection(inputValue.trim());
    if (created) {
      setInputValue("");
      setShowDropdown(false);
      setIsFocused(false);
      onClose();
    }
  }, [inputValue, isCreating, onCreateConnection, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && showDropdown && hoveredIndex >= 0) {
        // Handle dropdown selection first (before generic connect)
        e.preventDefault();
        const entry = filteredHistory[hoveredIndex];
        if (entry) {
          setInputValue(entry.url);
          setShowDropdown(false);
          void onCreateConnection(entry.url);
        }
      } else if (e.key === "Enter") {
        // Fallback: create when no dropdown selection
        void handleCreate();
      } else if (e.key === "Escape") {
        setShowDropdown(false);
        inputRef.current?.blur();
      } else if (e.key === "ArrowDown" && showDropdown) {
        e.preventDefault();
        setHoveredIndex((prev) => Math.min(prev + 1, filteredHistory.length - 1));
      } else if (e.key === "ArrowUp" && showDropdown) {
        e.preventDefault();
        setHoveredIndex((prev) => Math.max(prev - 1, 0));
      }
    },
    [handleCreate, showDropdown, hoveredIndex, filteredHistory, onCreateConnection]
  );

  const handleSelectHistory = useCallback(
    (entry: ServerHistoryEntry) => {
      setInputValue(entry.url);
      setShowDropdown(false);
      void onCreateConnection(entry.url);
    },
    [onCreateConnection]
  );

  if (!isOpen) {
    return <></>;
  }

  return (
    <div ref={containerRef} style={connectionBarStyles.container}>
      {/* Inject keyframe animation for spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div
        style={{
          ...connectionBarStyles.inputWrapper,
          ...(isFocused ? connectionBarStyles.inputWrapperFocused : {}),
          ...(error ? connectionBarStyles.inputWrapperError : {}),
        }}
      >
        {/* URL Input */}
        <input
          ref={inputRef}
          type="text"
          style={connectionBarStyles.urlInput}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          onKeyDown={handleKeyDown}
          placeholder="(Connect your Agent)"
        />

        {/* Action Button */}
        <button
          type="button"
          style={{
            ...connectionBarStyles.actionButton,
            ...connectionBarStyles.connectButton,
            ...(!inputValue.trim() || isCreating ? connectionBarStyles.buttonDisabled : {}),
          }}
          onClick={() => void handleCreate()}
          disabled={!inputValue.trim() || isCreating}
          title="Create connection"
        >
          {isCreating ? (
            <div style={connectionBarStyles.loadingSpinner} />
          ) : (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          )}
        </button>

        <button
          type="button"
          style={{
            ...connectionBarStyles.actionButton,
            ...connectionBarStyles.closeButton,
          }}
          onClick={onClose}
          title="Close"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* History Dropdown */}
      {showDropdown && (
        <div style={connectionBarStyles.dropdown}>
          {filteredHistory.map((entry, index) => (
            <div
              key={entry.url}
              style={{
                ...connectionBarStyles.dropdownItem,
                ...(hoveredIndex === index ? connectionBarStyles.dropdownItemHover : {}),
              }}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(-1)}
              onClick={() => handleSelectHistory(entry)}
            >
              {/* Protocol Badge */}
              {entry.protocolType !== "mcp" && (
                <span
                  style={{
                    ...connectionBarStyles.dropdownItemBadge,
                    ...(entry.protocolType === "chatgpt-apps"
                      ? connectionBarStyles.badgeChatgptApps
                      : connectionBarStyles.badgeMcpApps),
                  }}
                >
                  {entry.protocolType === "chatgpt-apps" ? "ChatGPT" : "MCP Apps"}
                </span>
              )}
              <span style={connectionBarStyles.dropdownItemUrl}>{entry.url}</span>
              {entry.name && <span style={connectionBarStyles.dropdownItemName}>{entry.name}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Error Tooltip */}
      {error && !isFocused && (
        <div style={connectionBarStyles.errorTooltip as React.CSSProperties}>{error}</div>
      )}
    </div>
  );
}

export default ConnectionBar;
