/**
 * McpPrimitivesPanel Component
 *
 * Displays MCP Tools, Resources, and Prompts in a tabbed interface.
 * Each primitive type is shown as a list of cards with schema details.
 */

import React, { useState, useCallback } from "react";
import type {
  McpTool,
  McpResource,
  McpPrompt,
  JsonSchemaProperty,
  McpPromptArgument,
} from "../types/mcp-primitives";

// =============================================================================
// Types
// =============================================================================

type TabType = "tools" | "resources" | "prompts";

export interface McpPrimitivesPanelProps {
  /** MCP Tools from the server */
  tools: McpTool[];
  /** MCP Resources from the server */
  resources: McpResource[];
  /** MCP Prompts from the server */
  prompts: McpPrompt[];
  /** Whether primitives are still loading */
  isLoading: boolean;
  /** Whether the panel is visible */
  isVisible: boolean;
  /** Whether the panel is collapsed (only used when position === 'left') */
  isCollapsed?: boolean;
  /** Callback to toggle collapsed state */
  onToggleCollapse?: () => void;
  /** Panel position affects styling */
  position: "center" | "left";
}

// =============================================================================
// Local Styles
// =============================================================================

const localStyles: Record<string, React.CSSProperties> = {
  panel: {
    backgroundColor: "#0d0e0e",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    transition: "width 0.25s ease, opacity 0.2s ease",
    height: "100%",
  },
  panelLeft: {
    width: "320px",
    flexShrink: 0,
    borderRight: "1px solid #2d2f2f",
  },
  panelCenter: {
    width: "100%",
    maxWidth: "800px",
    border: "1px solid #2d2f2f",
    borderRadius: "8px",
  },
  panelCollapsed: {
    width: 0,
    borderRight: "none",
    opacity: 0,
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
  title: {
    fontSize: "0.75rem",
    fontWeight: 500,
    color: "#9ca3af",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  collapseBtn: {
    background: "transparent",
    border: "1px solid #3d4040",
    borderRadius: "4px",
    padding: "0.25rem 0.375rem",
    cursor: "pointer",
    color: "#9ca3af",
    fontSize: "0.625rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.15s ease",
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
  content: {
    flex: 1,
    overflowY: "auto",
    padding: "0.75rem",
    fontSize: "0.75rem",
    minHeight: 0,
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
  card: {
    backgroundColor: "#111111",
    border: "1px solid #2d2f2f",
    borderRadius: "6px",
    padding: "0.75rem",
    marginBottom: "0.5rem",
  },
  cardHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: "0.5rem",
  },
  cardName: {
    fontSize: "0.8125rem",
    fontWeight: 600,
    color: "#e8e8e8",
    fontFamily:
      "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
  },
  cardDescription: {
    fontSize: "0.6875rem",
    color: "#9ca3af",
    marginBottom: "0.75rem",
    lineHeight: 1.5,
  },
  copyBtn: {
    fontFamily: "inherit",
    backgroundColor: "transparent",
    border: "1px solid #3d4040",
    color: "#6b7280",
    padding: "0.25rem 0.5rem",
    borderRadius: "4px",
    fontSize: "0.5625rem",
    cursor: "pointer",
    transition: "all 0.15s ease",
    flexShrink: 0,
  },
  copyBtnSuccess: {
    borderColor: "#20b2aa",
    color: "#20b2aa",
    backgroundColor: "rgba(32, 178, 170, 0.1)",
  },
  schemaSection: {
    marginTop: "0.5rem",
  },
  schemaSectionTitle: {
    fontSize: "0.5625rem",
    fontWeight: 600,
    color: "#6b7280",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    marginBottom: "0.375rem",
  },
  schemaItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.5rem",
    padding: "0.25rem 0",
    borderBottom: "1px solid #1a1a1a",
  },
  schemaItemLast: {
    borderBottom: "none",
  },
  schemaName: {
    fontFamily:
      "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
    fontSize: "0.6875rem",
    color: "#9cdcfe",
    flexShrink: 0,
    minWidth: "80px",
  },
  schemaType: {
    fontFamily:
      "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
    fontSize: "0.625rem",
    color: "#b5cea8",
    flexShrink: 0,
  },
  schemaRequired: {
    fontSize: "0.5rem",
    color: "#ff6b6b",
    fontWeight: 600,
    textTransform: "uppercase" as const,
  },
  schemaDesc: {
    fontSize: "0.625rem",
    color: "#6b7280",
    flex: 1,
  },
  resourceUri: {
    fontFamily:
      "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
    fontSize: "0.625rem",
    color: "#ce9178",
    backgroundColor: "rgba(206, 145, 120, 0.1)",
    padding: "0.25rem 0.5rem",
    borderRadius: "4px",
    marginBottom: "0.5rem",
    wordBreak: "break-all" as const,
  },
  resourceMimeType: {
    display: "inline-block",
    fontSize: "0.5625rem",
    color: "#569cd6",
    backgroundColor: "rgba(86, 156, 214, 0.1)",
    padding: "0.125rem 0.375rem",
    borderRadius: "3px",
    marginTop: "0.25rem",
  },
};

// =============================================================================
// Helper Components
// =============================================================================

/**
 * Format a JSON Schema property type for display
 */
function formatType(prop: JsonSchemaProperty): string {
  if (prop.enum) {
    return `enum(${prop.enum.slice(0, 3).join("|")}${prop.enum.length > 3 ? "|..." : ""})`;
  }
  if (prop.type === "array" && prop.items) {
    return `${formatType(prop.items)}[]`;
  }
  return prop.type || "unknown";
}

/**
 * Spinner component for loading state
 */
function Spinner(): React.ReactElement {
  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={localStyles.spinner} />
    </>
  );
}

/**
 * Copy to clipboard button with feedback
 */
function CopyButton({ data }: { data: unknown }): React.ReactElement {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback for browsers that don't support clipboard API
      const textarea = document.createElement("textarea");
      textarea.value = JSON.stringify(data, null, 2);
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [data]);

  return (
    <button
      style={{
        ...localStyles.copyBtn,
        ...(copied ? localStyles.copyBtnSuccess : {}),
      }}
      onClick={handleCopy}
      title="Copy JSON schema to clipboard"
    >
      {copied ? "Copied!" : "Copy JSON"}
    </button>
  );
}

/**
 * Schema properties list
 */
function SchemaProperties({
  properties,
  required = [],
}: {
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}): React.ReactElement | null {
  const entries = Object.entries(properties);
  if (entries.length === 0) return null;

  return (
    <div style={localStyles.schemaSection}>
      <div style={localStyles.schemaSectionTitle}>Parameters</div>
      {entries.map(([name, prop], index) => (
        <div
          key={name}
          style={{
            ...localStyles.schemaItem,
            ...(index === entries.length - 1 ? localStyles.schemaItemLast : {}),
          }}
        >
          <span style={localStyles.schemaName}>{name}</span>
          <span style={localStyles.schemaType}>{formatType(prop)}</span>
          {required.includes(name) && <span style={localStyles.schemaRequired}>req</span>}
          {prop.description && <span style={localStyles.schemaDesc}>{prop.description}</span>}
        </div>
      ))}
    </div>
  );
}

/**
 * Prompt arguments list
 */
function PromptArguments({ args }: { args: McpPromptArgument[] }): React.ReactElement | null {
  if (args.length === 0) return null;

  return (
    <div style={localStyles.schemaSection}>
      <div style={localStyles.schemaSectionTitle}>Arguments</div>
      {args.map((arg, index) => (
        <div
          key={arg.name}
          style={{
            ...localStyles.schemaItem,
            ...(index === args.length - 1 ? localStyles.schemaItemLast : {}),
          }}
        >
          <span style={localStyles.schemaName}>{arg.name}</span>
          {arg.required && <span style={localStyles.schemaRequired}>req</span>}
          {arg.description && <span style={localStyles.schemaDesc}>{arg.description}</span>}
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Card Components
// =============================================================================

function ToolCard({ tool }: { tool: McpTool }): React.ReactElement {
  return (
    <div style={localStyles.card}>
      <div style={localStyles.cardHeader}>
        <span style={localStyles.cardName}>{tool.name}</span>
        <CopyButton data={tool} />
      </div>
      {tool.description && <div style={localStyles.cardDescription}>{tool.description}</div>}
      {tool.inputSchema?.properties && (
        <SchemaProperties
          properties={tool.inputSchema.properties}
          required={tool.inputSchema.required}
        />
      )}
      {tool.outputSchema?.properties && (
        <div style={localStyles.schemaSection}>
          <div style={localStyles.schemaSectionTitle}>Output</div>
          {Object.entries(tool.outputSchema.properties).map(([name, prop], index, arr) => (
            <div
              key={name}
              style={{
                ...localStyles.schemaItem,
                ...(index === arr.length - 1 ? localStyles.schemaItemLast : {}),
              }}
            >
              <span style={localStyles.schemaName}>{name}</span>
              <span style={localStyles.schemaType}>{formatType(prop)}</span>
              {prop.description && <span style={localStyles.schemaDesc}>{prop.description}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ResourceCard({ resource }: { resource: McpResource }): React.ReactElement {
  return (
    <div style={localStyles.card}>
      <div style={localStyles.cardHeader}>
        <span style={localStyles.cardName}>{resource.name}</span>
        <CopyButton data={resource} />
      </div>
      <div style={localStyles.resourceUri}>{resource.uri}</div>
      {resource.description && (
        <div style={localStyles.cardDescription}>{resource.description}</div>
      )}
      {resource.mimeType && <span style={localStyles.resourceMimeType}>{resource.mimeType}</span>}
    </div>
  );
}

function PromptCard({ prompt }: { prompt: McpPrompt }): React.ReactElement {
  return (
    <div style={localStyles.card}>
      <div style={localStyles.cardHeader}>
        <span style={localStyles.cardName}>{prompt.name}</span>
        <CopyButton data={prompt} />
      </div>
      {prompt.description && <div style={localStyles.cardDescription}>{prompt.description}</div>}
      {prompt.arguments && prompt.arguments.length > 0 && (
        <PromptArguments args={prompt.arguments} />
      )}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function McpPrimitivesPanel({
  tools,
  resources,
  prompts,
  isLoading,
  isVisible,
  isCollapsed = false,
  onToggleCollapse,
  position,
}: McpPrimitivesPanelProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabType>("tools");

  // Build panel styles based on position and visibility
  const panelStyle: React.CSSProperties = {
    ...localStyles.panel,
    ...(position === "left" ? localStyles.panelLeft : localStyles.panelCenter),
    ...(position === "left" && !isVisible ? localStyles.panelCollapsed : {}),
  };

  // Handle collapsed state for left position
  if (position === "left" && isCollapsed) {
    return <div style={{ ...panelStyle, ...localStyles.panelCollapsed }} />;
  }

  if (!isVisible) {
    return <div style={{ ...panelStyle, display: "none" }} />;
  }

  const tabs: Array<{ type: TabType; label: string; count: number }> = [
    { type: "tools", label: "Tools", count: tools.length },
    { type: "resources", label: "Resources", count: resources.length },
    { type: "prompts", label: "Prompts", count: prompts.length },
  ];

  const renderContent = (): React.ReactElement => {
    if (isLoading) {
      return (
        <div style={localStyles.loadingState}>
          <Spinner />
          <span>Loading primitives...</span>
        </div>
      );
    }

    switch (activeTab) {
      case "tools":
        if (tools.length === 0) {
          return <div style={localStyles.emptyState}>No tools available</div>;
        }
        return (
          <>
            {tools.map((tool) => (
              <ToolCard key={tool.name} tool={tool} />
            ))}
          </>
        );

      case "resources":
        if (resources.length === 0) {
          return <div style={localStyles.emptyState}>No resources available</div>;
        }
        return (
          <>
            {resources.map((resource) => (
              <ResourceCard key={resource.uri} resource={resource} />
            ))}
          </>
        );

      case "prompts":
        if (prompts.length === 0) {
          return <div style={localStyles.emptyState}>No prompts available</div>;
        }
        return (
          <>
            {prompts.map((prompt) => (
              <PromptCard key={prompt.name} prompt={prompt} />
            ))}
          </>
        );
    }
  };

  return (
    <div style={panelStyle}>
      <div style={localStyles.header}>
        <span style={localStyles.title}>MCP Primitives</span>
        {position === "left" && onToggleCollapse && (
          <button style={localStyles.collapseBtn} onClick={onToggleCollapse} title="Collapse panel">
            ◀
          </button>
        )}
      </div>

      <div style={localStyles.tabs}>
        {tabs.map((tab) => (
          <button
            key={tab.type}
            style={{
              ...localStyles.tab,
              ...(activeTab === tab.type ? localStyles.tabActive : {}),
            }}
            onClick={() => setActiveTab(tab.type)}
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

      <div style={localStyles.content}>{renderContent()}</div>
    </div>
  );
}

export default McpPrimitivesPanel;
