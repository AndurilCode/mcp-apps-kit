/**
 * PrimitiveDetail Component
 *
 * Displays full details of a selected MCP primitive (tool, resource, or prompt).
 * Shows header with type badge, description, schema/parameters, and metadata.
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

export type PrimitiveType = "tool" | "resource" | "prompt";

export interface PrimitiveDetailProps {
  /** Type of the primitive */
  type: PrimitiveType;
  /** The primitive object (tool, resource, or prompt) */
  primitive: McpTool | McpResource | McpPrompt;
  /** Callback when close button is clicked */
  onClose: () => void;
}

// =============================================================================
// Constants
// =============================================================================

const FONT_SANS =
  "'Inter', 'SF Pro Display', 'Segoe UI', 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif";

const FONT_MONO =
  "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace";

// Type badge colors
const TYPE_COLORS: Record<PrimitiveType, { bg: string; text: string }> = {
  tool: { bg: "rgba(129, 199, 132, 0.15)", text: "#81c784" },
  resource: { bg: "rgba(206, 145, 120, 0.15)", text: "#ce9178" },
  prompt: { bg: "rgba(179, 157, 219, 0.15)", text: "#b39ddb" },
};

// =============================================================================
// Local Styles
// =============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    backgroundColor: "#0d0e0e",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.75rem 1rem",
    backgroundColor: "#0a0a0a",
    borderBottom: "1px solid #1a1a1a",
    flexShrink: 0,
    gap: "0.75rem",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    minWidth: 0,
    flex: 1,
  },
  name: {
    fontSize: "0.9375rem",
    fontWeight: 600,
    color: "#e8e8e8",
    fontFamily: FONT_SANS,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  typeBadge: {
    fontSize: "0.5625rem",
    fontWeight: 600,
    padding: "0.125rem 0.5rem",
    borderRadius: "3px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    flexShrink: 0,
  },
  closeBtn: {
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
    fontFamily: "inherit",
  },
  closeBtnHover: {
    borderColor: "#ffffff",
    color: "#ffffff",
  },
  content: {
    flex: 1,
    overflowY: "auto",
    padding: "1rem",
    fontSize: "0.75rem",
    minHeight: 0,
  },
  section: {
    marginBottom: "1rem",
  },
  sectionTitle: {
    fontSize: "0.5625rem",
    fontWeight: 600,
    color: "#6b7280",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    marginBottom: "0.5rem",
  },
  description: {
    fontSize: "0.75rem",
    color: "#9ca3af",
    lineHeight: 1.6,
  },
  // Resource-specific
  uri: {
    fontFamily: FONT_MONO,
    fontSize: "0.6875rem",
    color: "#ce9178",
    backgroundColor: "rgba(206, 145, 120, 0.1)",
    padding: "0.5rem 0.75rem",
    borderRadius: "4px",
    wordBreak: "break-all" as const,
  },
  mimeType: {
    display: "inline-block",
    fontFamily: FONT_MONO,
    fontSize: "0.625rem",
    color: "#569cd6",
    backgroundColor: "rgba(86, 156, 214, 0.1)",
    padding: "0.25rem 0.5rem",
    borderRadius: "4px",
    marginTop: "0.5rem",
  },
  // Schema items
  schemaItem: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    padding: "0.5rem 0",
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
    fontFamily: FONT_MONO,
    fontSize: "0.6875rem",
    color: "#ffffff",
  },
  schemaType: {
    fontFamily: FONT_MONO,
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
  // Metadata section
  metaSection: {
    padding: "0.75rem",
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderRadius: "6px",
    border: "1px solid #1a1a1a",
  },
  metaItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.5rem",
    padding: "0.25rem 0",
    fontSize: "0.625rem",
  },
  metaKey: {
    fontFamily: FONT_MONO,
    color: "#9cdcfe",
    flexShrink: 0,
  },
  metaValue: {
    fontFamily: FONT_MONO,
    color: "#ce9178",
    wordBreak: "break-all" as const,
  },
  metaValueBool: {
    color: "#569cd6",
  },
  metaValueNumber: {
    color: "#b5cea8",
  },
  // Copy button
  copyBtn: {
    fontFamily: "inherit",
    backgroundColor: "transparent",
    border: "1px solid #3d4040",
    color: "#9ca3af",
    padding: "0.5rem 1rem",
    borderRadius: "4px",
    fontSize: "0.6875rem",
    cursor: "pointer",
    transition: "all 0.15s ease",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  copyBtnHover: {
    borderColor: "#6b7280",
    color: "#ffffff",
  },
  copyBtnSuccess: {
    borderColor: "#81c784",
    color: "#81c784",
    backgroundColor: "rgba(129, 199, 132, 0.1)",
  },
  // Empty state
  emptyMeta: {
    color: "#4b5563",
    fontSize: "0.6875rem",
    fontStyle: "italic" as const,
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format a JSON Schema property type for display
 */
function formatType(prop: JsonSchemaProperty): string {
  if (prop.enum) {
    const enumDisplay = prop.enum.slice(0, 3).join(" | ");
    return prop.enum.length > 3 ? `${enumDisplay} | ...` : enumDisplay;
  }
  if (prop.type === "array" && prop.items) {
    return `${formatType(prop.items)}[]`;
  }
  return prop.type || "unknown";
}

/**
 * Format a metadata value for display
 */
function formatMetaValue(value: unknown): { text: string; style: React.CSSProperties } {
  if (value === null) {
    return { text: "null", style: styles.metaValueBool };
  }
  if (typeof value === "boolean") {
    return { text: String(value), style: styles.metaValueBool };
  }
  if (typeof value === "number") {
    return { text: String(value), style: styles.metaValueNumber };
  }
  if (typeof value === "string") {
    return { text: value, style: styles.metaValue };
  }
  if (Array.isArray(value) || typeof value === "object") {
    return { text: JSON.stringify(value), style: styles.metaValue };
  }
  return { text: String(value), style: styles.metaValue };
}

/**
 * Get the name of a primitive
 */
function getPrimitiveName(
  type: PrimitiveType,
  primitive: McpTool | McpResource | McpPrompt
): string {
  if (type === "resource") {
    return (primitive as McpResource).name;
  }
  return (primitive as McpTool | McpPrompt).name;
}

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * Copy to clipboard button
 */
function CopyButton({ data }: { data: unknown }): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers without clipboard API
      const textarea = document.createElement("textarea");
      textarea.value = JSON.stringify(data, null, 2);
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [data]);

  return (
    <button
      style={{
        ...styles.copyBtn,
        ...(copied ? styles.copyBtnSuccess : isHovered ? styles.copyBtnHover : {}),
      }}
      onClick={handleCopy}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title="Copy full JSON definition to clipboard"
      data-testid="copy-json-btn"
    >
      {copied ? "✓ Copied to Clipboard" : "Copy JSON"}
    </button>
  );
}

/**
 * Schema properties display for tools
 */
function SchemaProperties({
  title,
  properties,
  required = [],
}: {
  title: string;
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}): React.ReactElement | null {
  const entries = Object.entries(properties);
  if (entries.length === 0) return null;

  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>{title}</div>
      {entries.map(([name, prop], index) => (
        <div
          key={name}
          style={{
            ...styles.schemaItem,
            ...(index === entries.length - 1 ? styles.schemaItemLast : {}),
          }}
        >
          <div style={styles.schemaItemHeader}>
            <span style={styles.schemaName}>{name}</span>
            <span style={styles.schemaType}>{formatType(prop)}</span>
            {required.includes(name) && <span style={styles.schemaRequired}>*</span>}
          </div>
          {prop.description && <div style={styles.schemaDesc}>{prop.description}</div>}
        </div>
      ))}
    </div>
  );
}

/**
 * Prompt arguments display
 */
function PromptArgumentsList({ args }: { args: McpPromptArgument[] }): React.ReactElement | null {
  if (args.length === 0) return null;

  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>Arguments</div>
      {args.map((arg, index) => (
        <div
          key={arg.name}
          style={{
            ...styles.schemaItem,
            ...(index === args.length - 1 ? styles.schemaItemLast : {}),
          }}
        >
          <div style={styles.schemaItemHeader}>
            <span style={styles.schemaName}>{arg.name}</span>
            {arg.required && <span style={styles.schemaRequired}>*</span>}
          </div>
          {arg.description && <div style={styles.schemaDesc}>{arg.description}</div>}
        </div>
      ))}
    </div>
  );
}

/**
 * Metadata section (annotations, _meta)
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
    <div style={styles.section}>
      <div style={styles.sectionTitle}>{title}</div>
      <div style={styles.metaSection}>
        {Object.entries(data).map(([key, value]) => {
          const formatted = formatMetaValue(value);
          return (
            <div key={key} style={styles.metaItem}>
              <span style={styles.metaKey}>{key}:</span>
              <span style={formatted.style}>{formatted.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Tool-specific details
 */
function ToolDetails({ tool }: { tool: McpTool }): React.ReactElement {
  return (
    <>
      {tool.description && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Description</div>
          <div style={styles.description}>{tool.description}</div>
        </div>
      )}

      {tool.inputSchema?.properties && (
        <SchemaProperties
          title="Input Parameters"
          properties={tool.inputSchema.properties}
          required={tool.inputSchema.required}
        />
      )}

      {tool.outputSchema?.properties && (
        <SchemaProperties
          title="Output Schema"
          properties={tool.outputSchema.properties}
          required={tool.outputSchema.required}
        />
      )}

      <MetadataSection
        title="Annotations"
        data={tool.annotations as Record<string, unknown> | undefined}
      />
      <MetadataSection title="Metadata" data={tool._meta} />
    </>
  );
}

/**
 * Resource-specific details
 */
function ResourceDetails({ resource }: { resource: McpResource }): React.ReactElement {
  return (
    <>
      <div style={styles.section}>
        <div style={styles.sectionTitle}>URI</div>
        <div style={styles.uri}>{resource.uri}</div>
        {resource.mimeType && <div style={styles.mimeType}>{resource.mimeType}</div>}
      </div>

      {resource.description && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Description</div>
          <div style={styles.description}>{resource.description}</div>
        </div>
      )}

      <MetadataSection
        title="Annotations"
        data={resource.annotations as Record<string, unknown> | undefined}
      />
      <MetadataSection title="Metadata" data={resource._meta} />
    </>
  );
}

/**
 * Prompt-specific details
 */
function PromptDetails({ prompt }: { prompt: McpPrompt }): React.ReactElement {
  return (
    <>
      {prompt.description && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Description</div>
          <div style={styles.description}>{prompt.description}</div>
        </div>
      )}

      {prompt.arguments && prompt.arguments.length > 0 && (
        <PromptArgumentsList args={prompt.arguments} />
      )}

      <MetadataSection title="Metadata" data={prompt._meta} />
    </>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function PrimitiveDetail({
  type,
  primitive,
  onClose,
}: PrimitiveDetailProps): React.ReactElement {
  const [closeHovered, setCloseHovered] = useState(false);
  const name = getPrimitiveName(type, primitive);
  const typeColor = TYPE_COLORS[type];

  const renderDetails = (): React.ReactElement => {
    switch (type) {
      case "tool":
        return <ToolDetails tool={primitive as McpTool} />;
      case "resource":
        return <ResourceDetails resource={primitive as McpResource} />;
      case "prompt":
        return <PromptDetails prompt={primitive as McpPrompt} />;
    }
  };

  return (
    <div style={styles.container} data-testid="primitive-detail">
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span
            style={{
              ...styles.typeBadge,
              backgroundColor: typeColor.bg,
              color: typeColor.text,
            }}
            data-testid="type-badge"
          >
            {type}
          </span>
          <span style={styles.name} title={name}>
            {name}
          </span>
        </div>
        <button
          style={{
            ...styles.closeBtn,
            ...(closeHovered ? styles.closeBtnHover : {}),
          }}
          onClick={onClose}
          onMouseEnter={() => setCloseHovered(true)}
          onMouseLeave={() => setCloseHovered(false)}
          title="Close detail view"
          data-testid="close-btn"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div style={styles.content}>
        {renderDetails()}

        {/* Copy JSON Button - always at bottom */}
        <div style={{ ...styles.section, marginTop: "1.5rem" }}>
          <CopyButton data={primitive} />
        </div>
      </div>
    </div>
  );
}

export default PrimitiveDetail;
