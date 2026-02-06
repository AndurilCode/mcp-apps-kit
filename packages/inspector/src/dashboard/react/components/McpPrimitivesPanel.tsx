/**
 * McpPrimitivesPanel Component
 *
 * Displays MCP servers as collapsible blocks with their primitives grouped by kind.
 * Each server shows: header with name + Start/Stop button, and nested TOOLS/RESOURCES/PROMPTS sections.
 * Stopped servers appear greyed out with a "Start" button to reconnect.
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type {
  McpTool,
  McpResource,
  McpPrompt,
  JsonSchemaProperty,
  McpPromptArgument,
} from "../types/mcp-primitives";
import type { ConnectionParams } from "@mcp-apps-kit/testing";
import { SidebarConnectionForm } from "./SidebarConnectionForm";
import { PrimitiveDetail, type Primitive } from "./PrimitiveDetail";

// =============================================================================
// Types
// =============================================================================

/** Server data for display in the sidebar */
export interface ServerData {
  id: string;
  name: string;
  url: string;
  isConnected: boolean;
  tools: McpTool[];
  resources: McpResource[];
  prompts: McpPrompt[];
  /** Connection parameters including transport type */
  params?: {
    transport?: "stdio" | "http" | "sse" | string;
    [key: string]: unknown;
  };
  /** Server info from initialization */
  serverInfo?: {
    version?: string;
    name?: string;
    [key: string]: unknown;
  };
  /** Server capabilities */
  capabilities?: {
    tools?: boolean | object;
    resources?: boolean | object;
    prompts?: boolean | object;
    logging?: boolean | object;
    sampling?: boolean | object;
    roots?: boolean | object;
    [key: string]: unknown;
  };
}

/** Stopped connection stored for reconnection */
export interface StoppedConnection {
  id: string;
  name: string;
  url: string;
  params: ConnectionParams;
}

// =============================================================================
// Props Types - Support both OLD API (tests) and NEW API (server blocks)
// =============================================================================

/** Selected primitive identifier */
export interface SelectedPrimitive {
  serverId: string;
  kind: "tool" | "resource" | "prompt";
  name: string;
}

/** New API props for server blocks mode */
export interface McpPrimitivesPanelNewProps {
  /** Active server connections with their primitives */
  servers: ServerData[];
  /** Stopped connections that can be restarted */
  stoppedConnections: StoppedConnection[];
  /** ID of server currently reconnecting (shows loading state) */
  reconnectingServerId?: string | null;
  /** Whether primitives are still loading */
  isLoading: boolean;
  /** Whether the panel is visible */
  isVisible: boolean;
  /** Whether the panel is collapsed */
  isCollapsed?: boolean;
  /** Callback to toggle collapsed state */
  onToggleCollapse?: () => void;
  /** Panel width (for resizable panel) */
  panelWidth?: number;
  /** Resize handle props (for resizable panel) */
  resizeHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  /** Whether resize is active */
  isResizing?: boolean;
  /** Callback when Stop button is clicked */
  onStopServer?: (serverId: string) => void;
  /** Callback when Start button is clicked for a stopped server */
  onStartServer?: (stoppedConnection: StoppedConnection) => void;
  /** Callback when Delete button is clicked for a server */
  onDeleteServer?: (serverId: string, isConnected: boolean) => void;
  /** Callback to open connection form for new server (legacy - opens header form) */
  onAddServer?: () => void;
  /** Callback to connect to a new server with params (inline form) */
  onConnect?: (params: ConnectionParams) => Promise<boolean>;
  /** Whether a connection is currently being created */
  isCreating?: boolean;
  /** Connection error message */
  connectionError?: string | null;
  /** Currently selected primitive */
  selectedPrimitive?: SelectedPrimitive | null;
  /** Callback when a primitive is selected */
  onSelectPrimitive?: (primitive: SelectedPrimitive | null) => void;
  /** Resolved primitive data for detail view */
  resolvedPrimitive?: Primitive | null;
  /** Callback to close the primitive detail */
  onClosePrimitive?: () => void;
}

/** Legacy API props for backward compatibility with tests */
export interface McpPrimitivesPanelLegacyProps {
  /** MCP Tools from the server (legacy) */
  tools: McpTool[];
  /** MCP Resources from the server (legacy) */
  resources: McpResource[];
  /** MCP Prompts from the server (legacy) */
  prompts: McpPrompt[];
  /** Whether primitives are still loading */
  isLoading: boolean;
  /** Whether the panel is visible */
  isVisible: boolean;
  /** Whether the panel is collapsed (only used when position === 'left') */
  isCollapsed?: boolean;
  /** Callback to toggle collapsed state */
  onToggleCollapse?: () => void;
  /** Panel position affects styling (legacy) */
  position: "center" | "left";
  /** Panel width (for resizable left panel) */
  panelWidth?: number;
  /** Resize handle props (for resizable left panel) */
  resizeHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  /** Whether resize is active */
  isResizing?: boolean;
}

/** Combined props - supports both APIs */
export type McpPrimitivesPanelProps = McpPrimitivesPanelNewProps | McpPrimitivesPanelLegacyProps;

/** Type guard to check if using legacy API */
function isLegacyProps(props: McpPrimitivesPanelProps): props is McpPrimitivesPanelLegacyProps {
  return "position" in props && "tools" in props;
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
    width: "320px",
    flexShrink: 0,
    borderRight: "1px solid #2d2f2f",
  },
  panelCollapsed: {
    width: 0,
    borderRight: "none",
    opacity: 0,
  },
  // Header row 1: collapse toggle + title
  headerTitle: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.75rem",
    backgroundColor: "#0a0a0a",
    borderBottom: "1px solid #1a1a1a",
    flexShrink: 0,
  },
  headerTitleText: {
    fontSize: "0.9375rem",
    fontWeight: 600,
    color: "#e8e8e8",
    letterSpacing: "0.01em",
  },
  // Header row 2: search + add button
  headerSearch: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.5rem 0.75rem",
    backgroundColor: "#0a0a0a",
    borderBottom: "1px solid #1a1a1a",
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    backgroundColor: "#111111",
    border: "1px solid #2d2f2f",
    borderRadius: "4px",
    color: "#e8e8e8",
    padding: "0.375rem 0.5rem",
    fontSize: "0.75rem",
    fontFamily: "inherit",
    outline: "none",
  },
  addButton: {
    backgroundColor: "transparent",
    border: "1px solid #3d4040",
    borderRadius: "4px",
    padding: "0.375rem 0.625rem",
    cursor: "pointer",
    color: "#9ca3af",
    fontSize: "0.875rem",
    fontWeight: 500,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.15s ease",
    flexShrink: 0,
  },
  collapseBtn: {
    background: "transparent",
    border: "1px solid #3d4040",
    borderRadius: "4px",
    padding: "0.25rem 0.5rem",
    cursor: "pointer",
    color: "#9ca3af",
    fontSize: "0.75rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.15s ease",
    flexShrink: 0,
  },
  content: {
    flex: 1,
    overflowY: "auto",
    minHeight: 0,
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: "#9ca3af",
    fontSize: "0.75rem",
    padding: "2rem",
    textAlign: "center" as const,
    gap: "0.75rem",
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
  // Server block styles
  serverBlock: {
    borderBottom: "1px solid #1a1a1a",
  },
  serverBlockStopped: {
    opacity: 0.5,
  },
  serverHeader: {
    display: "flex",
    alignItems: "center",
    padding: "0.5rem 0.75rem",
    gap: "0.5rem",
    cursor: "pointer",
    userSelect: "none" as const,
  },
  serverName: {
    flex: 1,
    fontSize: "0.9375rem",
    fontWeight: 600,
    color: "#ffffff",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  serverNameStopped: {
    color: "#6b7280",
  },
  serverButton: {
    backgroundColor: "#ffffff",
    border: "none",
    borderRadius: "4px",
    padding: "0.25rem",
    cursor: "pointer",
    color: "#000000",
    fontSize: "0.875rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "opacity 0.15s ease",
    flexShrink: 0,
    opacity: 0.9,
  },
  serverButtonHover: {
    opacity: 1,
  },
  deleteButton: {
    backgroundColor: "transparent",
    border: "none",
    borderRadius: "4px",
    padding: "0.25rem",
    cursor: "pointer",
    color: "#6b7280",
    fontSize: "0.875rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "color 0.15s ease",
    flexShrink: 0,
  },
  expandIndicator: {
    fontSize: "0.5rem",
    color: "#6b7280",
    flexShrink: 0,
    width: "0.75rem",
    textAlign: "center" as const,
  },
  serverContent: {
    paddingBottom: "0.5rem",
  },
  stoppedMessage: {
    padding: "0.5rem 0.75rem 0.5rem 1.5rem",
    fontSize: "0.6875rem",
    color: "#9ca3af",
    fontStyle: "italic" as const,
  },
  // Server info section - horizontal chips
  serverInfoContent: {
    padding: "0.375rem 0.75rem 0.5rem",
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "0.375rem",
  },
  serverInfoChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    backgroundColor: "#1f1f1f",
    border: "1px solid #2d2f2f",
    borderRadius: "12px",
    padding: "0.125rem 0.5rem",
    fontSize: "0.625rem",
  },
  serverInfoLabel: {
    color: "#6b7280",
  },
  serverInfoValue: {
    color: "#e8e8e8",
  },
  // Primitive kind section
  kindSection: {
    paddingLeft: "0.75rem",
  },
  kindHeader: {
    padding: "0.375rem 0.5rem",
    fontSize: "0.6875rem",
    fontWeight: 600,
    color: "#6b7280",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  // Primitive item styles - clickable items that open detail view
  primitiveItem: {
    margin: "0.25rem 0.5rem",
    padding: "0.5rem 0.75rem",
    cursor: "pointer",
    fontSize: "0.875rem",
    fontWeight: 500,
    color: "#e8e8e8",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    transition: "all 0.15s ease",
    backgroundColor: "#1a1a1a",
    border: "1px solid #2d2f2f",
    borderRadius: "6px",
    outline: "none",
  },
  primitiveItemHover: {
    backgroundColor: "#252525",
  },
  primitiveItemActive: {
    backgroundColor: "#1f1f1f",
    borderColor: "#ffffff",
  },
  primitiveName: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    fontFamily: FONT_SANS,
  },
  widgetBadge: {
    fontSize: "0.5rem",
    fontWeight: 600,
    color: "#b39ddb",
    backgroundColor: "rgba(179, 157, 219, 0.15)",
    padding: "0.0625rem 0.25rem",
    borderRadius: "2px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.03em",
    flexShrink: 0,
  },
  // Resize handle
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
  // Card styles (for expanded primitive details - kept for compatibility)
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
      @keyframes slideInFromRight {
        from {
          opacity: 0;
          transform: translateX(8px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
      @keyframes slideOutToLeft {
        from {
          opacity: 1;
          transform: translateX(0);
        }
        to {
          opacity: 0;
          transform: translateX(-8px);
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
 * Animated wrapper for detail view - handles enter/exit animations
 */
function AnimatedDetailWrapper({
  children,
  isVisible,
}: {
  children: React.ReactNode;
  isVisible: boolean;
}): React.ReactElement | null {
  const [show, setShow] = useState(false);
  const [render, setRender] = useState(isVisible);

  useEffect(() => {
    if (isVisible) {
      setRender(true);
      // Trigger animation after mount
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setShow(true);
        });
      });
    } else {
      setShow(false);
      // Wait for exit animation
      const timer = setTimeout(() => setRender(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  if (!render) return null;

  return (
    <div
      style={{
        padding: "0.75rem",
        opacity: show ? 1 : 0,
        transform: show ? "translateX(0)" : isVisible ? "translateX(10px)" : "translateX(-10px)",
        transition: "opacity 0.2s ease-out, transform 0.2s ease-out",
      }}
    >
      {children}
    </div>
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
  const uiMeta = meta.ui as Record<string, unknown> | undefined;
  if (uiMeta?.resourceUri) return true;
  if (meta["ui/resourceUri"]) return true;
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
      setOverflow("hidden");
      rafId1 = requestAnimationFrame(() => {
        const height = el.scrollHeight;
        setMaxHeight(height > 0 ? `${height}px` : "none");
      });
      timer = setTimeout(() => {
        setMaxHeight("none");
        setOverflow("visible");
      }, COLLAPSE_TRANSITION_MS);
    } else {
      setOverflow("hidden");
      const height = el.scrollHeight;
      if (height > 0) {
        setMaxHeight(`${height}px`);
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
// Server Info Helpers
// =============================================================================

/**
 * Get list of enabled capabilities from capabilities object
 */
function getEnabledCapabilities(capabilities: ServerData["capabilities"] | undefined): string[] {
  if (!capabilities) return [];
  const enabled: string[] = [];
  for (const [key, value] of Object.entries(capabilities)) {
    if (value) {
      enabled.push(key);
    }
  }
  return enabled;
}

// =============================================================================
// Server Block Component
// =============================================================================

interface ServerBlockProps {
  server: ServerData | StoppedConnection;
  isConnected: boolean;
  isReconnecting?: boolean;
  searchFilter: string;
  onStop?: () => void;
  onStart?: () => void;
  onDelete?: () => void;
  selectedPrimitive?: SelectedPrimitive | null;
  onSelectPrimitive?: (primitive: SelectedPrimitive | null) => void;
}

function ServerBlock({
  server,
  isConnected,
  isReconnecting = false,
  searchFilter,
  onStop,
  onStart,
  onDelete,
  selectedPrimitive,
  onSelectPrimitive,
}: ServerBlockProps): React.ReactElement | null {
  const [isExpanded, setIsExpanded] = useState(true);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  // Helper to check if a primitive is selected
  const isPrimitiveSelected = useCallback(
    (kind: "tool" | "resource" | "prompt", name: string): boolean => {
      return (
        selectedPrimitive?.serverId === server.id &&
        selectedPrimitive?.kind === kind &&
        selectedPrimitive?.name === name
      );
    },
    [selectedPrimitive, server.id]
  );

  // Handler for primitive clicks
  const handlePrimitiveClick = useCallback(
    (kind: "tool" | "resource" | "prompt", name: string) => {
      if (onSelectPrimitive) {
        // Toggle selection - if already selected, deselect
        if (isPrimitiveSelected(kind, name)) {
          onSelectPrimitive(null);
        } else {
          onSelectPrimitive({ serverId: server.id, kind, name });
        }
      }
    },
    [onSelectPrimitive, server.id, isPrimitiveSelected]
  );

  // Get primitives (only for connected servers)
  const tools = "tools" in server ? server.tools : [];
  const resources = "resources" in server ? server.resources : [];
  const prompts = "prompts" in server ? server.prompts : [];

  // Filter primitives by search
  const q = searchFilter.toLowerCase();
  const filteredTools = q ? tools.filter((t) => t.name.toLowerCase().includes(q)) : tools;
  const filteredResources = q
    ? resources.filter((r) => r.name.toLowerCase().includes(q))
    : resources;
  const filteredPrompts = q ? prompts.filter((p) => p.name.toLowerCase().includes(q)) : prompts;

  // If searching and no matches, hide the server block
  if (
    q &&
    filteredTools.length === 0 &&
    filteredResources.length === 0 &&
    filteredPrompts.length === 0
  ) {
    return null;
  }

  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isConnected && onStop) {
      onStop();
    } else if (!isConnected && onStart) {
      onStart();
    }
  };

  return (
    <div
      style={{
        ...localStyles.serverBlock,
        ...(!isConnected ? localStyles.serverBlockStopped : {}),
      }}
    >
      {/* Server header */}
      <div
        style={localStyles.serverHeader}
        onClick={() => setIsExpanded(!isExpanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
        aria-expanded={isExpanded}
        data-testid={`server-block-header-${server.id}`}
      >
        <span
          style={{
            ...localStyles.serverName,
            ...(!isConnected ? localStyles.serverNameStopped : {}),
          }}
        >
          {server.name || server.url}
        </span>
        <button
          style={{
            ...localStyles.serverButton,
            ...(isReconnecting ? { cursor: "default", opacity: 0.6 } : {}),
          }}
          onClick={handleButtonClick}
          onMouseEnter={(e) => {
            if (!isReconnecting) e.currentTarget.style.opacity = "1";
          }}
          onMouseLeave={(e) => {
            if (!isReconnecting) e.currentTarget.style.opacity = "0.8";
          }}
          disabled={isReconnecting}
          title={isReconnecting ? "Connecting..." : isConnected ? "Stop server" : "Start server"}
          data-testid={`server-${isConnected ? "stop" : "start"}-btn-${server.id}`}
        >
          {isReconnecting ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ animation: "spin 1s linear infinite" }}
            >
              <circle cx="12" cy="12" r="10" opacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
          ) : isConnected ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="8,5 19,12 8,19" />
            </svg>
          )}
        </button>
        {onDelete && (
          <button
            style={localStyles.deleteButton}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#ef4444";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#6b7280";
            }}
            title="Remove server"
            data-testid={`server-delete-btn-${server.id}`}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        )}
      </div>

      {/* Server content */}
      <AnimatedCollapse isOpen={isExpanded}>
        {/* Server info - horizontal chips */}
        <div style={localStyles.serverInfoContent} data-testid={`server-info-content-${server.id}`}>
          <span style={localStyles.serverInfoChip}>
            <span style={localStyles.serverInfoLabel}>status</span>
            <span style={localStyles.serverInfoValue}>
              {isConnected ? "running" : isReconnecting ? "connecting" : "stopped"}
            </span>
          </span>
          <span style={localStyles.serverInfoChip}>
            <span style={localStyles.serverInfoLabel}>transport</span>
            <span style={localStyles.serverInfoValue}>
              {"params" in server && server.params?.transport ? server.params.transport : "—"}
            </span>
          </span>
          {"serverInfo" in server && server.serverInfo?.version && (
            <span style={localStyles.serverInfoChip}>
              <span style={localStyles.serverInfoLabel}>v</span>
              <span style={localStyles.serverInfoValue}>{server.serverInfo.version}</span>
            </span>
          )}
          {"capabilities" in server && getEnabledCapabilities(server.capabilities).length > 0 && (
            <span style={localStyles.serverInfoChip}>
              <span style={localStyles.serverInfoLabel}>caps</span>
              <span style={localStyles.serverInfoValue}>
                {getEnabledCapabilities(server.capabilities).join(", ")}
              </span>
            </span>
          )}
        </div>

        {isConnected ? (
          <div style={localStyles.serverContent}>
            {/* Tools section */}
            {filteredTools.length > 0 && (
              <div style={localStyles.kindSection}>
                <div style={localStyles.kindHeader}>Tools</div>
                {filteredTools.map((tool) => {
                  const isSelected = isPrimitiveSelected("tool", tool.name);
                  return (
                    <div
                      key={tool.name}
                      style={{
                        ...localStyles.primitiveItem,
                        ...(isSelected
                          ? localStyles.primitiveItemActive
                          : hoveredItem === `tool-${tool.name}`
                            ? localStyles.primitiveItemHover
                            : {}),
                      }}
                      onClick={() => handlePrimitiveClick("tool", tool.name)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handlePrimitiveClick("tool", tool.name);
                        }
                      }}
                      onMouseEnter={() => setHoveredItem(`tool-${tool.name}`)}
                      onMouseLeave={() => setHoveredItem(null)}
                      role="button"
                      tabIndex={0}
                      aria-selected={isSelected}
                      data-testid={`tool-item-${tool.name}`}
                    >
                      <span style={localStyles.primitiveName}>{tool.name}</span>
                      {hasToolUI(tool) && <span style={localStyles.widgetBadge}>Widget</span>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Resources section */}
            {filteredResources.length > 0 && (
              <div style={localStyles.kindSection}>
                <div style={localStyles.kindHeader}>Resources</div>
                {filteredResources.map((resource) => {
                  const isSelected = isPrimitiveSelected("resource", resource.name);
                  return (
                    <div
                      key={resource.uri}
                      style={{
                        ...localStyles.primitiveItem,
                        ...(isSelected
                          ? localStyles.primitiveItemActive
                          : hoveredItem === `resource-${resource.uri}`
                            ? localStyles.primitiveItemHover
                            : {}),
                      }}
                      onClick={() => handlePrimitiveClick("resource", resource.name)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handlePrimitiveClick("resource", resource.name);
                        }
                      }}
                      onMouseEnter={() => setHoveredItem(`resource-${resource.uri}`)}
                      onMouseLeave={() => setHoveredItem(null)}
                      role="button"
                      tabIndex={0}
                      aria-selected={isSelected}
                      data-testid={`resource-item-${resource.name}`}
                    >
                      <span style={localStyles.primitiveName}>{resource.name}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Prompts section */}
            {filteredPrompts.length > 0 && (
              <div style={localStyles.kindSection}>
                <div style={localStyles.kindHeader}>Prompts</div>
                {filteredPrompts.map((prompt) => {
                  const isSelected = isPrimitiveSelected("prompt", prompt.name);
                  return (
                    <div
                      key={prompt.name}
                      style={{
                        ...localStyles.primitiveItem,
                        ...(isSelected
                          ? localStyles.primitiveItemActive
                          : hoveredItem === `prompt-${prompt.name}`
                            ? localStyles.primitiveItemHover
                            : {}),
                      }}
                      onClick={() => handlePrimitiveClick("prompt", prompt.name)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handlePrimitiveClick("prompt", prompt.name);
                        }
                      }}
                      onMouseEnter={() => setHoveredItem(`prompt-${prompt.name}`)}
                      onMouseLeave={() => setHoveredItem(null)}
                      role="button"
                      tabIndex={0}
                      aria-selected={isSelected}
                      data-testid={`prompt-item-${prompt.name}`}
                    >
                      <span style={localStyles.primitiveName}>{prompt.name}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Empty state when server is connected but has no primitives */}
            {filteredTools.length === 0 &&
              filteredResources.length === 0 &&
              filteredPrompts.length === 0 && (
                <div style={localStyles.stoppedMessage}>No primitives available</div>
              )}
          </div>
        ) : (
          <div style={localStyles.stoppedMessage}>Server stopped</div>
        )}
      </AnimatedCollapse>
    </div>
  );
}

// =============================================================================
// Legacy Tab Type (for backward compatibility)
// =============================================================================

type TabType = "tools" | "resources" | "prompts";

// =============================================================================
// Legacy Card Components (for backward compatibility with tests)
// =============================================================================

function ToolCard({ tool }: { tool: McpTool }): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasUI = hasToolUI(tool);

  return (
    <div style={localStyles.card} data-testid={`tool-card-${tool.name}`}>
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
          <span style={{ ...localStyles.cardName, fontFamily: FONT_SANS }}>{tool.name}</span>
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
    <div style={localStyles.card} data-testid={`resource-card-${resource.uri}`}>
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
          <span style={{ ...localStyles.cardName, fontFamily: FONT_SANS }}>{resource.name}</span>
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
    <div style={localStyles.card} data-testid={`prompt-card-${prompt.name}`}>
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
          <span style={{ ...localStyles.cardName, fontFamily: FONT_SANS }}>{prompt.name}</span>
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
// Legacy Panel Styles (for backward compatibility)
// =============================================================================

const legacyStyles: Record<string, React.CSSProperties> = {
  panelCenter: {
    width: "100%",
    height: "100%",
    border: "1px solid #2d2f2f",
    borderRadius: "8px",
  },
  panelCenterAppear: {
    animation: "panelAppear 0.4s ease-out forwards",
  },
  legacyHeader: {
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
};

// =============================================================================
// Legacy Panel Content (for backward compatibility with tests)
// =============================================================================

function LegacyPanelContent({
  tools,
  resources,
  prompts,
  isLoading,
  isVisible,
  isCollapsed,
  onToggleCollapse,
  position,
  panelWidth,
  resizeHandleProps,
  isResizing,
}: McpPrimitivesPanelLegacyProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabType>("tools");

  // Build panel styles based on position and visibility
  const panelStyle: React.CSSProperties = {
    ...localStyles.panel,
    ...(position === "left" ? {} : legacyStyles.panelCenter),
    ...(position === "left" && !isVisible ? localStyles.panelCollapsed : {}),
    ...(position === "center" ? legacyStyles.panelCenterAppear : {}),
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
          <div style={legacyStyles.tabs}>
            {tabs.map((tab) => (
              <button
                key={tab.type}
                style={{
                  ...legacyStyles.tab,
                  ...(activeTab === tab.type ? legacyStyles.tabActive : {}),
                }}
                onClick={() => setActiveTab(tab.type)}
              >
                {tab.label}
                <span
                  style={{
                    ...legacyStyles.tabCount,
                    ...(activeTab === tab.type ? legacyStyles.tabCountActive : {}),
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
        <div style={legacyStyles.legacyHeader}>
          <span style={legacyStyles.title}>MCP Primitives</span>
        </div>
      )}
      <div style={legacyStyles.tabs}>
        {tabs.map((tab) => (
          <button
            key={tab.type}
            style={{
              ...legacyStyles.tab,
              ...(activeTab === tab.type ? legacyStyles.tabActive : {}),
            }}
            onClick={() => setActiveTab(tab.type)}
          >
            {tab.label}
            <span
              style={{
                ...legacyStyles.tabCount,
                ...(activeTab === tab.type ? legacyStyles.tabCountActive : {}),
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

// =============================================================================
// New Server Blocks Content
// =============================================================================

function ServerBlocksContent({
  servers,
  stoppedConnections,
  reconnectingServerId,
  isLoading,
  isVisible,
  isCollapsed,
  onToggleCollapse,
  panelWidth,
  resizeHandleProps,
  isResizing,
  onStopServer,
  onStartServer,
  onDeleteServer,
  onAddServer,
  onConnect,
  isCreating,
  connectionError,
  selectedPrimitive,
  onSelectPrimitive,
  resolvedPrimitive,
  onClosePrimitive,
}: McpPrimitivesPanelNewProps): React.ReactElement {
  const [searchFilter, setSearchFilter] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Handle "+" button click - toggle inline form
  const handleAddClick = useCallback(() => {
    if (onConnect) {
      // Use inline form
      setIsFormOpen((prev) => !prev);
    } else if (onAddServer) {
      // Fall back to legacy behavior (opens header form)
      onAddServer();
    }
  }, [onConnect, onAddServer]);

  // Handle connection from inline form
  const handleFormConnect = useCallback(
    async (params: ConnectionParams): Promise<boolean> => {
      if (!onConnect) return false;
      const success = await onConnect(params);
      if (success) {
        setIsFormOpen(false);
      }
      return success;
    },
    [onConnect]
  );

  // Handle cancel from inline form
  const handleFormCancel = useCallback(() => {
    setIsFormOpen(false);
  }, []);

  // Build server history from stopped connections
  const serverHistory = useMemo(() => {
    return stoppedConnections.map((stopped) => ({
      name: stopped.name || stopped.url,
      params: stopped.params,
    }));
  }, [stoppedConnections]);

  // Build panel styles
  const panelStyle: React.CSSProperties = {
    ...localStyles.panel,
    ...(panelWidth ? { width: panelWidth } : {}),
    ...(!isVisible || isCollapsed ? localStyles.panelCollapsed : {}),
  };

  // When not visible, hide completely
  if (!isVisible) {
    return <div style={panelStyle} />;
  }

  // When collapsed, show minimal expand button
  if (isCollapsed) {
    return (
      <div
        style={{
          ...localStyles.panel,
          width: "40px",
          minWidth: "40px",
        }}
      >
        <div
          style={{
            ...localStyles.headerTitle,
            justifyContent: "center",
            padding: "0.75rem 0.5rem",
          }}
        >
          {onToggleCollapse && (
            <button
              style={localStyles.collapseBtn}
              onClick={onToggleCollapse}
              title="Expand sidebar"
              data-testid="sidebar-expand-btn"
            >
              ☰
            </button>
          )}
        </div>
      </div>
    );
  }

  const hasAnyServer = servers.length > 0 || stoppedConnections.length > 0;

  return (
    <>
      <div style={panelStyle}>
        <KeyframeStyles />
        {/* Header row 1: collapse toggle + title */}
        <div style={localStyles.headerTitle} data-testid="sidebar-header">
          {onToggleCollapse && (
            <button
              style={localStyles.collapseBtn}
              onClick={onToggleCollapse}
              title="Collapse sidebar"
              data-testid="sidebar-collapse-btn"
            >
              ✕
            </button>
          )}
          <span style={localStyles.headerTitleText}>MCP Explorer</span>
        </div>

        {/* Header row 2: search + add button */}
        <div style={localStyles.headerSearch} data-testid="sidebar-search-row">
          <input
            type="text"
            placeholder="Search..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            style={localStyles.searchInput}
            data-testid="sidebar-search-input"
          />
          <button
            style={localStyles.addButton}
            onClick={handleAddClick}
            title="Add server"
            data-testid="add-server-btn"
          >
            +
          </button>
        </div>

        {/* Inline connection form (shown when "+" is clicked) */}
        <SidebarConnectionForm
          isOpen={isFormOpen}
          isCreating={isCreating}
          error={connectionError}
          onConnect={handleFormConnect}
          onCancel={handleFormCancel}
          serverHistory={serverHistory}
        />

        {/* Content */}
        <div style={localStyles.content}>
          {/* Show PrimitiveDetail when a primitive is selected */}
          <AnimatedDetailWrapper isVisible={!!resolvedPrimitive}>
            {resolvedPrimitive && (
              <PrimitiveDetail primitive={resolvedPrimitive} onClose={onClosePrimitive} />
            )}
          </AnimatedDetailWrapper>
          {!resolvedPrimitive &&
            (isLoading && servers.length === 0 && stoppedConnections.length === 0 ? (
              <div style={localStyles.loadingState}>
                <Spinner />
                <span>Loading...</span>
              </div>
            ) : !hasAnyServer && !isFormOpen ? (
              <div style={localStyles.emptyState}>
                <span>No servers connected</span>
                <button
                  style={{
                    ...localStyles.addButton,
                    padding: "0.5rem 1rem",
                  }}
                  onClick={handleAddClick}
                >
                  + Connect Server
                </button>
              </div>
            ) : (
              <>
                {/* Active servers */}
                {servers.map((server) => (
                  <ServerBlock
                    key={server.id}
                    server={server}
                    isConnected={true}
                    searchFilter={searchFilter}
                    onStop={() => onStopServer?.(server.id)}
                    onDelete={() => onDeleteServer?.(server.id, true)}
                    selectedPrimitive={selectedPrimitive}
                    onSelectPrimitive={onSelectPrimitive}
                  />
                ))}

                {/* Stopped servers */}
                {stoppedConnections.map((stopped) => (
                  <ServerBlock
                    key={`stopped-${stopped.id}`}
                    server={stopped}
                    isConnected={false}
                    isReconnecting={reconnectingServerId === stopped.id}
                    searchFilter={searchFilter}
                    onStart={() => onStartServer?.(stopped)}
                    onDelete={() => onDeleteServer?.(stopped.id, false)}
                  />
                ))}
              </>
            ))}
        </div>
      </div>

      {/* Resize handle */}
      {resizeHandleProps && (
        <div
          {...resizeHandleProps}
          style={{
            ...localStyles.resizeHandle,
            ...(isResizing ? localStyles.resizeHandleActive : {}),
          }}
        />
      )}
    </>
  );
}

// =============================================================================
// Main Component - Supports both Legacy and New APIs
// =============================================================================

export function McpPrimitivesPanel(props: McpPrimitivesPanelProps): React.ReactElement {
  // Use type guard to determine which API is being used
  if (isLegacyProps(props)) {
    return <LegacyPanelContent {...props} />;
  }
  return <ServerBlocksContent {...props} />;
}

export default McpPrimitivesPanel;

// Re-export types for backward compatibility
export type { McpTool, McpResource, McpPrompt };
