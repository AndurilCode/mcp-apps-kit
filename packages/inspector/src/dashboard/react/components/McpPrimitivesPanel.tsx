/**
 * McpPrimitivesPanel Component
 *
 * Displays MCP Tools, Resources, and Prompts in a tabbed interface.
 * Each primitive type is shown as a list of cards with schema details.
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
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
  /** Panel width (for resizable left panel) */
  panelWidth?: number;
  /** Resize handle props (for resizable left panel) */
  resizeHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  /** Whether resize is active */
  isResizing?: boolean;
}

// Font stack (matches styles.ts FONT_SANS)
const FONT_SANS =
  "'Inter', 'SF Pro Display', 'Segoe UI', 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif";

// =============================================================================
// Local Styles
// =============================================================================

const localStyles: Record<string, React.CSSProperties> = {
  panel: {
    backgroundColor: "#0d0e0e",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    transition: "width 0.25s ease, opacity 0.3s ease, transform 0.3s ease",
    height: "100%",
  },
  panelLeft: {
    width: "320px",
    flexShrink: 0,
    borderRight: "1px solid #2d2f2f",
  },
  panelCenter: {
    width: "100%",
    height: "100%",
    border: "1px solid #2d2f2f",
    borderRadius: "8px",
  },
  panelCenterAppear: {
    animation: "panelAppear 0.4s ease-out forwards",
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
    alignItems: "center",
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
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderColor: "#ffffff",
    color: "#ffffff",
  },
  tabCount: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    padding: "0.125rem 0.375rem",
    borderRadius: "3px",
    fontSize: "0.5625rem",
    fontWeight: 500,
  },
  tabCountActive: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
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
    borderTopColor: "#ffffff",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  card: {
    backgroundColor: "#111111",
    border: "1px solid #2d2f2f",
    borderRadius: "6px",
    padding: "0.5rem 0.75rem",
    marginBottom: "0.5rem",
  },
  cardHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: "0.5rem",
  },
  cardHeaderClickable: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
    userSelect: "none" as const,
    gap: "0.5rem",
  },
  expandIndicator: {
    fontSize: "0.5rem",
    color: "#6b7280",
    flexShrink: 0,
    width: "0.75rem",
    textAlign: "center" as const,
    transition: "color 0.15s ease",
  },
  cardName: {
    fontSize: "0.9375rem",
    fontWeight: 600,
    color: "#e8e8e8",
    fontFamily: FONT_SANS,
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
    borderColor: "#ffffff",
    color: "#ffffff",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
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
    flexDirection: "column",
    gap: "0.25rem",
    padding: "0.375rem 0",
    borderBottom: "1px solid #1a1a1a",
  },
  schemaItemLast: {
    borderBottom: "none",
  },
  schemaItemHeader: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    flexWrap: "wrap" as const,
  },
  schemaName: {
    fontFamily:
      "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
    fontSize: "0.6875rem",
    color: "#ffffff",
  },
  schemaType: {
    fontFamily:
      "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
    fontSize: "0.625rem",
    color: "#c4b5fd",
  },
  schemaRequired: {
    fontSize: "0.75rem",
    color: "#ef9a9a",
    fontWeight: 600,
  },
  schemaDesc: {
    fontSize: "0.625rem",
    color: "#6b7280",
    lineHeight: 1.4,
    paddingLeft: "0.25rem",
  },
  // Widget badge for tools with UI
  widgetBadge: {
    fontSize: "0.5rem",
    fontWeight: 600,
    color: "#b39ddb",
    backgroundColor: "rgba(179, 157, 219, 0.15)",
    padding: "0.125rem 0.375rem",
    borderRadius: "3px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.03em",
  },
  // Resize handle for left panel
  resizeHandle: {
    width: "6px",
    background:
      "linear-gradient(to right, transparent 2px, #2d2f2f 2px, #2d2f2f 4px, transparent 4px)",
    cursor: "ew-resize",
    flexShrink: 0,
    transition: "background 0.15s ease",
  },
  resizeHandleActive: {
    background:
      "linear-gradient(to right, transparent 2px, #ffffff 2px, #ffffff 4px, transparent 4px)",
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
  // Metadata section (annotations, _meta)
  metaSection: {
    marginTop: "0.5rem",
    padding: "0.5rem",
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderRadius: "4px",
    border: "1px solid #1a1a1a",
  },
  metaSectionTitle: {
    fontSize: "0.5625rem",
    fontWeight: 600,
    color: "#6b7280",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    marginBottom: "0.375rem",
  },
  metaItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.5rem",
    padding: "0.125rem 0",
    fontSize: "0.625rem",
  },
  metaKey: {
    fontFamily:
      "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
    color: "#9cdcfe",
    flexShrink: 0,
  },
  metaValue: {
    fontFamily:
      "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
    color: "#ce9178",
    wordBreak: "break-all" as const,
  },
  metaValueBool: {
    color: "#569cd6",
  },
  metaValueNumber: {
    color: "#b5cea8",
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
 * Inject keyframe animations
 */
function KeyframeStyles(): React.ReactElement {
  return (
    <style>{`
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes panelAppear {
        from {
          opacity: 0;
          transform: scale(0.95) translateY(10px);
        }
        to {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }
    `}</style>
  );
}

/**
 * Spinner component for loading state
 */
function Spinner(): React.ReactElement {
  return <div style={localStyles.spinner} />;
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
          <div style={localStyles.schemaItemHeader}>
            <span style={localStyles.schemaName}>{name}</span>
            <span style={localStyles.schemaType}>{formatType(prop)}</span>
            {required.includes(name) && <span style={localStyles.schemaRequired}>*</span>}
          </div>
          {prop.description && <div style={localStyles.schemaDesc}>{prop.description}</div>}
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
          <div style={localStyles.schemaItemHeader}>
            <span style={localStyles.schemaName}>{arg.name}</span>
            {arg.required && <span style={localStyles.schemaRequired}>*</span>}
          </div>
          {arg.description && <div style={localStyles.schemaDesc}>{arg.description}</div>}
        </div>
      ))}
    </div>
  );
}

/**
 * Check if a tool has UI (widget)
 */
function hasToolUI(tool: McpTool): boolean {
  const meta = tool._meta;
  if (!meta) return false;

  // MCP Apps format: _meta.ui.resourceUri
  const uiMeta = meta.ui as Record<string, unknown> | undefined;
  if (uiMeta?.resourceUri) return true;

  // Alternative MCP format: _meta["ui/resourceUri"]
  if (meta["ui/resourceUri"]) return true;

  // OpenAI format: _meta["openai/outputTemplate"]
  if (meta["openai/outputTemplate"]) return true;

  return false;
}

/**
 * Format a metadata value for display
 */
function formatMetaValue(value: unknown): { text: string; style: React.CSSProperties } {
  const defaultStyle = localStyles.metaValue as React.CSSProperties;
  const boolStyle = localStyles.metaValueBool as React.CSSProperties;
  const numberStyle = localStyles.metaValueNumber as React.CSSProperties;

  if (value === null) {
    return { text: "null", style: boolStyle };
  }
  if (typeof value === "boolean") {
    return { text: String(value), style: boolStyle };
  }
  if (typeof value === "number") {
    return { text: String(value), style: numberStyle };
  }
  if (typeof value === "string") {
    return { text: value, style: defaultStyle };
  }
  if (Array.isArray(value)) {
    return { text: JSON.stringify(value), style: defaultStyle };
  }
  if (typeof value === "object") {
    return { text: JSON.stringify(value), style: defaultStyle };
  }
  return { text: String(value), style: defaultStyle };
}

/**
 * Render a metadata section (annotations or _meta)
 */
function MetadataSection({
  title,
  data,
}: {
  title: string;
  data: Record<string, unknown> | undefined;
}): React.ReactElement | null {
  if (!data || Object.keys(data).length === 0) return null;

  return (
    <div style={localStyles.metaSection}>
      <div style={localStyles.metaSectionTitle}>{title}</div>
      {Object.entries(data).map(([key, value]) => {
        const formatted = formatMetaValue(value);
        return (
          <div key={key} style={localStyles.metaItem}>
            <span style={localStyles.metaKey}>{key}:</span>
            <span style={formatted.style}>{formatted.text}</span>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Animated Collapse
// =============================================================================

/** Smooth expand/collapse wrapper using max-height transition */
const COLLAPSE_TRANSITION_MS = 200;
const COLLAPSE_TRANSITION_CSS = `${COLLAPSE_TRANSITION_MS / 1000}s`;

function AnimatedCollapse({
  isOpen,
  children,
}: {
  isOpen: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const contentRef = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<string>(isOpen ? "none" : "0px");
  const [overflow, setOverflow] = useState<string>(isOpen ? "visible" : "hidden");

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    let rafId1: number | undefined;
    let rafId2: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (isOpen) {
      // Keep overflow hidden during the expand transition
      setOverflow("hidden");
      // Measure content and animate from 0 to its height
      rafId1 = requestAnimationFrame(() => {
        const height = el.scrollHeight;
        setMaxHeight(height > 0 ? `${height}px` : "none");
      });
      // After transition completes, switch to none/visible so content can grow
      timer = setTimeout(() => {
        setMaxHeight("none");
        setOverflow("visible");
      }, COLLAPSE_TRANSITION_MS);
    } else {
      // Snap to current measured height, keep overflow hidden
      setOverflow("hidden");
      const height = el.scrollHeight;
      if (height > 0) {
        setMaxHeight(`${height}px`);
        // Double rAF ensures the browser has painted the explicit height before transitioning to 0
        rafId1 = requestAnimationFrame(() => {
          rafId2 = requestAnimationFrame(() => setMaxHeight("0px"));
        });
      } else {
        setMaxHeight("0px");
      }
    }

    return () => {
      if (rafId1 !== undefined) cancelAnimationFrame(rafId1);
      if (rafId2 !== undefined) cancelAnimationFrame(rafId2);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [isOpen]);

  return (
    <div
      ref={contentRef}
      data-collapsed={!isOpen}
      style={{
        maxHeight,
        overflow,
        transition: `max-height ${COLLAPSE_TRANSITION_CSS} ease-in-out`,
      }}
    >
      {children}
    </div>
  );
}

// =============================================================================
// Card Components
// =============================================================================

function ToolCard({ tool }: { tool: McpTool }): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasUI = hasToolUI(tool);

  return (
    <div style={localStyles.card}>
      <div
        style={localStyles.cardHeaderClickable}
        onClick={() => setIsExpanded((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsExpanded((prev) => !prev);
          }
        }}
        tabIndex={0}
        role="button"
        aria-expanded={isExpanded}
        data-testid={`tool-card-header-${tool.name}`}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
          <span style={localStyles.expandIndicator}>{isExpanded ? "▼" : "▶"}</span>
          <span style={localStyles.cardName}>{tool.name}</span>
          {hasUI && <span style={localStyles.widgetBadge}>Widget</span>}
        </div>
      </div>
      <AnimatedCollapse isOpen={isExpanded}>
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
                <div style={localStyles.schemaItemHeader}>
                  <span style={localStyles.schemaName}>{name}</span>
                  <span style={localStyles.schemaType}>{formatType(prop)}</span>
                </div>
                {prop.description && <div style={localStyles.schemaDesc}>{prop.description}</div>}
              </div>
            ))}
          </div>
        )}
        <MetadataSection
          title="Annotations"
          data={tool.annotations as Record<string, unknown> | undefined}
        />
        <MetadataSection title="Metadata" data={tool._meta} />
        <div style={{ marginTop: "0.5rem" }}>
          <CopyButton data={tool} />
        </div>
      </AnimatedCollapse>
    </div>
  );
}

function ResourceCard({ resource }: { resource: McpResource }): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div style={localStyles.card}>
      <div
        style={localStyles.cardHeaderClickable}
        onClick={() => setIsExpanded((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsExpanded((prev) => !prev);
          }
        }}
        tabIndex={0}
        role="button"
        aria-expanded={isExpanded}
        data-testid={`resource-card-header-${resource.name}`}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
          <span style={localStyles.expandIndicator}>{isExpanded ? "▼" : "▶"}</span>
          <span style={localStyles.cardName}>{resource.name}</span>
        </div>
      </div>
      <AnimatedCollapse isOpen={isExpanded}>
        <div style={localStyles.resourceUri}>{resource.uri}</div>
        {resource.description && (
          <div style={localStyles.cardDescription}>{resource.description}</div>
        )}
        {resource.mimeType && <span style={localStyles.resourceMimeType}>{resource.mimeType}</span>}
        <MetadataSection
          title="Annotations"
          data={resource.annotations as Record<string, unknown> | undefined}
        />
        <MetadataSection title="Metadata" data={resource._meta} />
        <div style={{ marginTop: "0.5rem" }}>
          <CopyButton data={resource} />
        </div>
      </AnimatedCollapse>
    </div>
  );
}

function PromptCard({ prompt }: { prompt: McpPrompt }): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div style={localStyles.card}>
      <div
        style={localStyles.cardHeaderClickable}
        onClick={() => setIsExpanded((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsExpanded((prev) => !prev);
          }
        }}
        tabIndex={0}
        role="button"
        aria-expanded={isExpanded}
        data-testid={`prompt-card-header-${prompt.name}`}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
          <span style={localStyles.expandIndicator}>{isExpanded ? "▼" : "▶"}</span>
          <span style={localStyles.cardName}>{prompt.name}</span>
        </div>
      </div>
      <AnimatedCollapse isOpen={isExpanded}>
        {prompt.description && <div style={localStyles.cardDescription}>{prompt.description}</div>}
        {prompt.arguments && prompt.arguments.length > 0 && (
          <PromptArguments args={prompt.arguments} />
        )}
        <MetadataSection title="Metadata" data={prompt._meta} />
        <div style={{ marginTop: "0.5rem" }}>
          <CopyButton data={prompt} />
        </div>
      </AnimatedCollapse>
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
  panelWidth,
  resizeHandleProps,
  isResizing,
}: McpPrimitivesPanelProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabType>("tools");

  // Build panel styles based on position and visibility
  const panelStyle: React.CSSProperties = {
    ...localStyles.panel,
    ...(position === "left" ? localStyles.panelLeft : localStyles.panelCenter),
    ...(position === "left" && !isVisible ? localStyles.panelCollapsed : {}),
    ...(position === "center" ? localStyles.panelCenterAppear : {}),
    ...(position === "left" && panelWidth ? { width: panelWidth } : {}),
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

  // Wrapper for left position with resize handle
  if (position === "left" && resizeHandleProps) {
    return (
      <>
        <div style={panelStyle}>
          <KeyframeStyles />
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
            {onToggleCollapse && (
              <button
                style={{ ...localStyles.collapseBtn, marginLeft: "auto" }}
                onClick={onToggleCollapse}
                title="Collapse panel"
              >
                ◀
              </button>
            )}
          </div>

          <div style={localStyles.content}>{renderContent()}</div>
        </div>
        <div
          {...resizeHandleProps}
          style={{
            ...localStyles.resizeHandle,
            ...(isResizing ? localStyles.resizeHandleActive : {}),
          }}
        />
      </>
    );
  }

  return (
    <div style={panelStyle}>
      <KeyframeStyles />
      {position === "center" && (
        <div style={localStyles.header}>
          <span style={localStyles.title}>MCP Primitives</span>
        </div>
      )}
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
        {position === "left" && onToggleCollapse && (
          <button
            style={{ ...localStyles.collapseBtn, marginLeft: "auto" }}
            onClick={onToggleCollapse}
            title="Collapse panel"
          >
            ◀
          </button>
        )}
      </div>

      <div style={localStyles.content}>{renderContent()}</div>
    </div>
  );
}

export default McpPrimitivesPanel;
