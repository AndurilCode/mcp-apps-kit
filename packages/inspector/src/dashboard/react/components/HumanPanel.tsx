/**
 * HumanPanel Component
 *
 * Interactive orchestrator panel for human mode.
 * Provides tabbed access to Tools (execute), Resources (read), and Prompts (run)
 * with full interactive capabilities — distinct from the read-only McpPrimitivesPanel.
 */

import React, { useState, useCallback, useEffect } from "react";
import type { McpTool, McpResource, McpPrompt } from "../types/mcp-primitives";
import { ToolExecutor } from "./ToolExecutor";
import { ResourceBrowser } from "./ResourceBrowser";
import { PromptRunner } from "./PromptRunner";

// =============================================================================
// Types
// =============================================================================

type TabType = "tools" | "resources" | "prompts";

export interface HumanPanelProps {
  tools: McpTool[];
  resources: McpResource[];
  prompts: McpPrompt[];
  isLoading: boolean;
  baseUrl: string;
  connectionId: string | null;
}

// =============================================================================
// Local Styles
// =============================================================================

const localStyles: Record<string, React.CSSProperties> = {
  panel: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: "100%",
    backgroundColor: "#0d0e0e",
    overflow: "hidden",
    border: "1px solid #2d2f2f",
    borderRadius: "8px",
    animation: "panelAppear 0.4s ease-out forwards",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.75rem 1rem",
    backgroundColor: "#0a0a0a",
    borderBottom: "1px solid #1a1a1a",
    flexShrink: 0,
  },
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  title: {
    fontSize: "0.75rem",
    fontWeight: 500,
    color: "#9ca3af",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  interactiveBadge: {
    fontSize: "0.5rem",
    fontWeight: 700,
    color: "#20b2aa",
    backgroundColor: "rgba(32, 178, 170, 0.15)",
    padding: "0.125rem 0.375rem",
    borderRadius: "3px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  tabs: {
    display: "flex",
    gap: "0.25rem",
    padding: "0.5rem 0.75rem",
    backgroundColor: "#0a0a0a",
    borderBottom: "1px solid #1a1a1a",
    flexShrink: 0,
  },
  tab: {
    fontFamily: "inherit",
    backgroundColor: "transparent",
    border: "1px solid #3d4040",
    color: "#9ca3af",
    padding: "0.375rem 0.75rem",
    borderRadius: "4px",
    fontSize: "0.6875rem",
    cursor: "pointer",
    transition: "all 0.15s ease",
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
  },
  tabActive: {
    backgroundColor: "rgba(32, 178, 170, 0.15)",
    borderColor: "#20b2aa",
    color: "#20b2aa",
  },
  tabCount: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    padding: "0.125rem 0.375rem",
    borderRadius: "3px",
    fontSize: "0.5625rem",
    fontWeight: 500,
  },
  tabCountActive: {
    backgroundColor: "rgba(32, 178, 170, 0.25)",
  },
  contentArea: {
    flex: 1,
    display: "flex",
    minHeight: 0,
    overflow: "hidden",
  },
  // Tools/Prompts: split layout
  splitLayout: {
    display: "flex",
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  listPanel: {
    width: "260px",
    flexShrink: 0,
    borderRight: "1px solid #2d2f2f",
    overflowY: "auto" as const,
    padding: "0.5rem",
  },
  detailPanel: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "0.75rem",
  },
  // List items
  listItem: {
    padding: "0.5rem 0.625rem",
    borderRadius: "4px",
    cursor: "pointer",
    transition: "all 0.15s ease",
    marginBottom: "0.25rem",
    border: "1px solid transparent",
  },
  listItemActive: {
    backgroundColor: "rgba(32, 178, 170, 0.1)",
    borderColor: "rgba(32, 178, 170, 0.3)",
  },
  listItemHover: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  listItemName: {
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "#e0e0e0",
    fontFamily:
      "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
  },
  listItemDesc: {
    fontSize: "0.625rem",
    color: "#6b7280",
    marginTop: "0.125rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  emptyState: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: "#4b5563",
    fontSize: "0.75rem",
    padding: "2rem",
    textAlign: "center" as const,
  },
  selectPrompt: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: "#4b5563",
    fontSize: "0.75rem",
    padding: "2rem",
    textAlign: "center" as const,
    flexDirection: "column",
    gap: "0.5rem",
  },
  selectIcon: {
    fontSize: "1.5rem",
    opacity: 0.5,
  },
  loadingState: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: "#6b7280",
    fontSize: "0.75rem",
    gap: "0.5rem",
  },
  spinner: {
    width: "16px",
    height: "16px",
    border: "2px solid #3d4040",
    borderTopColor: "#20b2aa",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  // Full-width tab content (for resources)
  fullContent: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "0.75rem",
  },
};

// =============================================================================
// Helpers
// =============================================================================

function Spinner(): React.ReactElement {
  return <div style={localStyles.spinner} />;
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

// =============================================================================
// List Item Component
// =============================================================================

function ListItem({
  name,
  description,
  isActive,
  onClick,
}: {
  name: string;
  description?: string;
  isActive: boolean;
  onClick: () => void;
}): React.ReactElement {
  const [isHovered, setIsHovered] = useState(false);

  // Reset hover state when active state changes to avoid stale visual artifacts
  useEffect(() => {
    setIsHovered(false);
  }, [isActive]);

  return (
    <div
      style={{
        ...localStyles.listItem,
        ...(isActive ? localStyles.listItemActive : {}),
        ...(!isActive && isHovered ? localStyles.listItemHover : {}),
      }}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={localStyles.listItemName}>{name}</div>
      {description && <div style={localStyles.listItemDesc}>{truncate(description, 60)}</div>}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function HumanPanel({
  tools,
  resources,
  prompts,
  isLoading,
  baseUrl,
  connectionId,
}: HumanPanelProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabType>("tools");
  const [selectedToolName, setSelectedToolName] = useState<string | null>(null);
  const [selectedPromptName, setSelectedPromptName] = useState<string | null>(null);

  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab);
  }, []);

  const selectedTool = selectedToolName
    ? (tools.find((t) => t.name === selectedToolName) ?? null)
    : null;
  const selectedPrompt = selectedPromptName
    ? (prompts.find((p) => p.name === selectedPromptName) ?? null)
    : null;

  const tabs: Array<{ type: TabType; label: string; count: number }> = [
    { type: "tools", label: "⚡ Tools", count: tools.length },
    { type: "resources", label: "📄 Resources", count: resources.length },
    { type: "prompts", label: "💬 Prompts", count: prompts.length },
  ];

  const renderContent = (): React.ReactElement => {
    if (isLoading) {
      return (
        <div style={localStyles.loadingState}>
          <Spinner />
          <span>Loading primitives…</span>
        </div>
      );
    }

    switch (activeTab) {
      case "tools": {
        if (tools.length === 0) {
          return <div style={localStyles.emptyState}>No tools available from the MCP server</div>;
        }
        return (
          <div style={localStyles.splitLayout}>
            <div style={localStyles.listPanel}>
              {tools.map((tool) => (
                <ListItem
                  key={tool.name}
                  name={tool.name}
                  description={tool.description}
                  isActive={selectedToolName === tool.name}
                  onClick={() => setSelectedToolName(tool.name)}
                />
              ))}
            </div>
            <div style={localStyles.detailPanel}>
              {selectedTool ? (
                <ToolExecutor tool={selectedTool} baseUrl={baseUrl} connectionId={connectionId} />
              ) : (
                <div style={localStyles.selectPrompt}>
                  <span style={localStyles.selectIcon}>🔧</span>
                  <span>Select a tool to execute</span>
                </div>
              )}
            </div>
          </div>
        );
      }

      case "resources": {
        if (resources.length === 0) {
          return (
            <div style={localStyles.emptyState}>No resources available from the MCP server</div>
          );
        }
        return (
          <div style={localStyles.fullContent}>
            <ResourceBrowser resources={resources} baseUrl={baseUrl} connectionId={connectionId} />
          </div>
        );
      }

      case "prompts": {
        if (prompts.length === 0) {
          return <div style={localStyles.emptyState}>No prompts available from the MCP server</div>;
        }
        return (
          <div style={localStyles.splitLayout}>
            <div style={localStyles.listPanel}>
              {prompts.map((prompt) => (
                <ListItem
                  key={prompt.name}
                  name={prompt.name}
                  description={prompt.description}
                  isActive={selectedPromptName === prompt.name}
                  onClick={() => setSelectedPromptName(prompt.name)}
                />
              ))}
            </div>
            <div style={localStyles.detailPanel}>
              {selectedPrompt ? (
                <PromptRunner
                  prompt={selectedPrompt}
                  baseUrl={baseUrl}
                  connectionId={connectionId}
                />
              ) : (
                <div style={localStyles.selectPrompt}>
                  <span style={localStyles.selectIcon}>💬</span>
                  <span>Select a prompt to run</span>
                </div>
              )}
            </div>
          </div>
        );
      }
    }
  };

  return (
    <div style={localStyles.panel}>
      {/* Header */}
      <div style={localStyles.header}>
        <div style={localStyles.titleRow}>
          <span style={localStyles.title}>Human Mode</span>
          <span style={localStyles.interactiveBadge}>Interactive</span>
        </div>
      </div>

      {/* Tab Bar */}
      <div style={localStyles.tabs}>
        {tabs.map((tab) => (
          <button
            key={tab.type}
            style={{
              ...localStyles.tab,
              ...(activeTab === tab.type ? localStyles.tabActive : {}),
            }}
            onClick={() => handleTabChange(tab.type)}
          >
            {tab.label}
            <span
              style={{
                ...localStyles.tabCount,
                ...(activeTab === tab.type ? localStyles.tabCountActive : {}),
              }}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div style={localStyles.contentArea}>{renderContent()}</div>
    </div>
  );
}

export default HumanPanel;
