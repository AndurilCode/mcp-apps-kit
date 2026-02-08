/**
 * TabBar Component
 *
 * Chrome-like tab bar for multi-connection support.
 * Each tab represents an active MCP server connection.
 */

import React from "react";

/**
 * Metadata for a single connection tab.
 */
export interface TabInfo {
  id: string;
  url: string;
  serverInfo: { name?: string; version?: string } | null;
  status: string;
  /** Whether this connection uses OAuth authentication */
  isOAuth?: boolean;
}

/**
 * Props for the TabBar component.
 */
export interface TabBarProps {
  tabs: TabInfo[];
  activeTabId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
}

/** Lock icon for OAuth-authenticated connections, matching Toolbar.tsx */
function LockIcon(): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="OAuth authenticated"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

const tabBarStyles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    alignItems: "flex-end",
    backgroundColor: "#0d0e0e",
    borderBottom: "1px solid #2d2f2f",
    padding: "0 0.5rem",
    gap: "0.25rem",
    minHeight: "36px",
  },
  tabs: {
    display: "flex",
    alignItems: "flex-end",
    gap: "0.25rem",
    overflowX: "auto",
    flex: 1,
  },
  tab: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    backgroundColor: "#1a1a1a",
    color: "#e0e0e0",
    border: "1px solid #2d2f2f",
    borderBottom: "none",
    borderRadius: "8px 8px 0 0",
    padding: "0.35rem 0.65rem",
    fontSize: "0.75rem",
    cursor: "pointer",
    minWidth: "140px",
    maxWidth: "260px",
  },
  tabActive: {
    backgroundColor: "#2d2f2f",
  },
  tabTitle: {
    flex: 1,
    overflow: "hidden",
    whiteSpace: "nowrap" as const,
    textOverflow: "ellipsis",
    color: "#e0e0e0",
  },
  lockIcon: {
    flexShrink: 0,
    marginRight: "2px",
    verticalAlign: "middle",
  },
  closeButton: {
    background: "transparent",
    border: "none",
    color: "#9aa0a6",
    cursor: "pointer",
    padding: "2px",
    borderRadius: "4px",
    lineHeight: 1,
    fontSize: "14px",
  },
  addButton: {
    backgroundColor: "#1a1a1a",
    border: "1px solid #2d2f2f",
    color: "#e0e0e0",
    borderRadius: "6px",
    width: "28px",
    height: "28px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontSize: "16px",
    alignSelf: "center",
  },
};

/**
 * Render a Chrome-like tab bar for multiple connections.
 *
 * @param props - TabBar props.
 * @returns The tab bar UI.
 */
export function TabBar({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onAdd,
}: TabBarProps): React.ReactElement | null {
  if (tabs.length === 0) {
    return null;
  }

  return (
    <div style={tabBarStyles.container}>
      <div style={tabBarStyles.tabs}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const title = tab.serverInfo?.name ?? tab.url ?? "Unknown";
          return (
            <div
              key={tab.id}
              style={{
                ...tabBarStyles.tab,
                ...(isActive ? tabBarStyles.tabActive : {}),
              }}
              onClick={() => onSelect(tab.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(tab.id);
                }
              }}
              title={tab.url}
              role="tab"
              tabIndex={0}
              aria-selected={isActive}
            >
              <div style={tabBarStyles.tabTitle}>
                {tab.isOAuth && (
                  <span style={tabBarStyles.lockIcon} title="OAuth authenticated">
                    <LockIcon />
                  </span>
                )}
                {title}
              </div>
              <button
                type="button"
                style={tabBarStyles.closeButton}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                }}
                aria-label="Close tab"
                title="Close connection"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <button type="button" style={tabBarStyles.addButton} onClick={onAdd} title="New connection">
        +
      </button>
    </div>
  );
}

/**
 * Default export for the TabBar component.
 */
export default TabBar;
