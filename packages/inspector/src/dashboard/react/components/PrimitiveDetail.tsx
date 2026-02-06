/**
 * PrimitiveDetail Component
 *
 * Displays detailed information about a selected MCP primitive (tool, resource, or prompt).
 * Browse mode shows read-only details; action mode (next subtask) will handle execution.
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

/** Union type for all primitive kinds */
export type Primitive =
  | (McpTool & { kind: "tool" })
  | (McpResource & { kind: "resource" })
  | (McpPrompt & { kind: "prompt" });

/** Props for the PrimitiveDetail component */
export interface PrimitiveDetailProps {
  /** The primitive to display */
  primitive: Primitive;
  /** Callback when action button is clicked (wired to action mode in next subtask) */
  onAction?: (primitive: Primitive) => void;
  /** Callback when back/close is requested */
  onClose?: () => void;
}

// =============================================================================
// Styles
// =============================================================================

const FONT_MONO =
  "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace";

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: "#111111",
    border: "1px solid #2d2f2f",
    borderRadius: "6px",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  // Header
  header: {
    padding: "12px 16px",
    borderBottom: "1px solid #2d2f2f",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
    backgroundColor: "#0d0e0e",
  },
  name: {
    fontSize: "1rem",
    fontWeight: 600,
    color: "#e8e8e8",
    margin: 0,
  },
  tag: {
    display: "inline-flex",
    alignItems: "center",
    border: "1px solid #3d4040",
    borderRadius: "3px",
    padding: "2px 8px",
    fontSize: "0.6875rem",
    color: "#9ca3af",
    whiteSpace: "nowrap",
  },
  tagKind: {
    backgroundColor: "rgba(32, 178, 170, 0.15)",
    borderColor: "#20b2aa",
    color: "#20b2aa",
  },
  tagReadOnly: {
    backgroundColor: "rgba(96, 165, 250, 0.15)",
    borderColor: "#60a5fa",
    color: "#60a5fa",
  },
  tagIdempotent: {
    backgroundColor: "rgba(167, 139, 250, 0.15)",
    borderColor: "#a78bfa",
    color: "#a78bfa",
  },
  tagDestructive: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderColor: "#ef4444",
    color: "#ef4444",
  },
  tagMimeType: {
    backgroundColor: "rgba(251, 191, 36, 0.15)",
    borderColor: "#fbbf24",
    color: "#fbbf24",
  },
  annotations: {
    display: "flex",
    gap: "4px",
    marginLeft: "auto",
    flexWrap: "wrap",
  },
  // Body
  body: {
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    flex: 1,
    overflowY: "auto",
  },
  summary: {
    fontSize: "0.8125rem",
    lineHeight: 1.6,
    color: "#d1d5db",
    margin: 0,
  },
  // Collapsible description
  collapsibleToggle: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    cursor: "pointer",
    userSelect: "none",
    padding: "4px 0",
    fontSize: "0.75rem",
    color: "#9ca3af",
    border: "none",
    background: "none",
    textAlign: "left",
  },
  collapsibleIcon: {
    fontSize: "0.625rem",
    width: "12px",
  },
  descriptionContent: {
    paddingLeft: "18px",
    paddingTop: "8px",
  },
  descriptionText: {
    fontSize: "0.75rem",
    lineHeight: 1.6,
    color: "#9ca3af",
    margin: 0,
  },
  descriptionParagraph: {
    marginTop: "6px",
  },
  // URI section (resources)
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  sectionTitle: {
    fontSize: "0.6875rem",
    fontWeight: 600,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  uriBox: {
    fontFamily: FONT_MONO,
    fontSize: "0.75rem",
    color: "#ce9178",
    backgroundColor: "rgba(206, 145, 120, 0.1)",
    padding: "8px 12px",
    borderRadius: "4px",
    wordBreak: "break-all",
    border: "1px solid #2d2f2f",
  },
  // Parameters section
  paramList: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  paramItem: {
    padding: "8px 0",
    borderBottom: "1px solid #1a1a1a",
  },
  paramItemLast: {
    borderBottom: "none",
  },
  paramHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  paramName: {
    fontFamily: FONT_MONO,
    fontSize: "0.8125rem",
    color: "#ffffff",
    fontWeight: 500,
  },
  paramType: {
    fontFamily: FONT_MONO,
    fontSize: "0.6875rem",
    color: "#c4b5fd",
    backgroundColor: "rgba(196, 181, 253, 0.1)",
    padding: "1px 6px",
    borderRadius: "3px",
  },
  paramRequired: {
    fontSize: "0.6875rem",
    color: "#ef9a9a",
    backgroundColor: "rgba(239, 154, 154, 0.1)",
    padding: "1px 6px",
    borderRadius: "3px",
  },
  paramOptional: {
    fontSize: "0.6875rem",
    color: "#9ca3af",
    backgroundColor: "rgba(156, 163, 175, 0.1)",
    padding: "1px 6px",
    borderRadius: "3px",
  },
  paramDesc: {
    fontSize: "0.6875rem",
    color: "#6b7280",
    lineHeight: 1.5,
    marginTop: "4px",
    paddingLeft: "2px",
  },
  // Footer
  footer: {
    padding: "12px 16px",
    borderTop: "1px solid #2d2f2f",
    display: "flex",
    gap: "8px",
    backgroundColor: "#0d0e0e",
  },
  button: {
    fontFamily: "inherit",
    fontSize: "0.75rem",
    padding: "8px 14px",
    borderRadius: "4px",
    cursor: "pointer",
    transition: "all 0.15s ease",
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  buttonSecondary: {
    backgroundColor: "transparent",
    border: "1px solid #3d4040",
    color: "#9ca3af",
  },
  buttonPrimary: {
    backgroundColor: "#ffffff",
    border: "1px solid #ffffff",
    color: "#000000",
    fontWeight: 500,
  },
  copySuccess: {
    borderColor: "#22c55e",
    color: "#22c55e",
    backgroundColor: "rgba(34, 197, 94, 0.1)",
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
    const preview = prop.enum.slice(0, 3).join(" | ");
    return prop.enum.length > 3 ? `${preview} | ...` : preview;
  }
  if (prop.type === "array" && prop.items) {
    return `${formatType(prop.items)}[]`;
  }
  return prop.type || "unknown";
}

/**
 * Get the summary text for a primitive (description or fallback)
 */
function getSummary(primitive: Primitive): string | undefined {
  // Tools, resources, and prompts all have description field
  return primitive.description;
}

/**
 * Get the action button label based on primitive kind
 */
function getActionLabel(kind: Primitive["kind"]): { icon: string; label: string } {
  switch (kind) {
    case "tool":
      return { icon: "▶", label: "Run" };
    case "resource":
      return { icon: "↓", label: "Read" };
    case "prompt":
      return { icon: "→", label: "Use" };
  }
}

// =============================================================================
// Sub-Components
// =============================================================================

/** Tag component for consistent styling */
function Tag({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant?: "kind" | "readOnly" | "idempotent" | "destructive" | "mimeType";
}): React.ReactElement {
  const variantStyles: Record<string, React.CSSProperties> = {
    kind: styles.tagKind,
    readOnly: styles.tagReadOnly,
    idempotent: styles.tagIdempotent,
    destructive: styles.tagDestructive,
    mimeType: styles.tagMimeType,
  };

  return (
    <span style={{ ...styles.tag, ...(variant ? variantStyles[variant] : {}) }}>{children}</span>
  );
}

/** Collapsible description section */
function CollapsibleDescription({ description }: { description: string }): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);

  // Split description into paragraphs
  const paragraphs = description.split("\n\n").filter((p) => p.trim());

  return (
    <div>
      <button
        style={styles.collapsibleToggle}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        data-testid="description-toggle"
      >
        <span style={styles.collapsibleIcon}>{isOpen ? "▾" : "▸"}</span>
        <span>Description</span>
      </button>
      {isOpen && (
        <div style={styles.descriptionContent}>
          {paragraphs.map((paragraph, index) => (
            <p
              key={index}
              style={{
                ...styles.descriptionText,
                ...(index > 0 ? styles.descriptionParagraph : {}),
              }}
            >
              {paragraph}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Parameters section for tools */
function ParametersSection({
  properties,
  required = [],
}: {
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}): React.ReactElement | null {
  const entries = Object.entries(properties);
  if (entries.length === 0) return null;

  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>Parameters</div>
      <div style={styles.paramList}>
        {entries.map(([name, prop], index) => (
          <div
            key={name}
            style={{
              ...styles.paramItem,
              ...(index === entries.length - 1 ? styles.paramItemLast : {}),
            }}
            data-testid={`param-${name}`}
          >
            <div style={styles.paramHeader}>
              <span style={styles.paramName}>{name}</span>
              <span style={styles.paramType}>{formatType(prop)}</span>
              <span style={required.includes(name) ? styles.paramRequired : styles.paramOptional}>
                {required.includes(name) ? "required" : "optional"}
              </span>
            </div>
            {prop.description && <div style={styles.paramDesc}>{prop.description}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Arguments section for prompts */
function ArgumentsSection({ args }: { args: McpPromptArgument[] }): React.ReactElement | null {
  if (args.length === 0) return null;

  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>Arguments</div>
      <div style={styles.paramList}>
        {args.map((arg, index) => (
          <div
            key={arg.name}
            style={{
              ...styles.paramItem,
              ...(index === args.length - 1 ? styles.paramItemLast : {}),
            }}
            data-testid={`arg-${arg.name}`}
          >
            <div style={styles.paramHeader}>
              <span style={styles.paramName}>{arg.name}</span>
              <span style={arg.required ? styles.paramRequired : styles.paramOptional}>
                {arg.required ? "required" : "optional"}
              </span>
            </div>
            {arg.description && <div style={styles.paramDesc}>{arg.description}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Annotations tags for tools */
function AnnotationTags({
  annotations,
}: {
  annotations: McpTool["annotations"];
}): React.ReactElement | null {
  if (!annotations) return null;

  const tags: React.ReactElement[] = [];

  if (annotations.readOnlyHint) {
    tags.push(
      <Tag key="readOnly" variant="readOnly">
        read-only
      </Tag>
    );
  }

  if (annotations.idempotentHint) {
    tags.push(
      <Tag key="idempotent" variant="idempotent">
        idempotent
      </Tag>
    );
  }

  if (annotations.destructiveHint) {
    tags.push(
      <Tag key="destructive" variant="destructive">
        ⚠ destructive
      </Tag>
    );
  }

  if (tags.length === 0) return null;

  return <div style={styles.annotations}>{tags}</div>;
}

/** Copy JSON button with feedback */
function CopyJsonButton({ data }: { data: unknown }): React.ReactElement {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback for older browsers
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
        ...styles.button,
        ...styles.buttonSecondary,
        ...(copied ? styles.copySuccess : {}),
      }}
      onClick={handleCopy}
      title="Copy JSON definition to clipboard"
      data-testid="copy-json-btn"
    >
      {copied ? "Copied!" : "Copy JSON"}
    </button>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * PrimitiveDetail displays detailed information about a selected MCP primitive.
 *
 * Structure:
 * - Header: name, kind tag, annotation tags
 * - Body: summary, collapsible description, URI (resources), parameters (tools), arguments (prompts)
 * - Footer: Copy JSON button, action button
 */
export function PrimitiveDetail({
  primitive,
  onAction,
  onClose,
}: PrimitiveDetailProps): React.ReactElement {
  const summary = getSummary(primitive);
  const { icon, label } = getActionLabel(primitive.kind);

  // Extract data without the kind field for JSON export
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { kind, ...primitiveData } = primitive;

  const handleAction = useCallback(() => {
    onAction?.(primitive);
  }, [onAction, primitive]);

  return (
    <div style={styles.container} data-testid="primitive-detail">
      {/* Header */}
      <div style={styles.header} data-testid="primitive-detail-header">
        <h2 style={styles.name}>{primitive.name}</h2>
        <Tag variant="kind">{primitive.kind}</Tag>
        {primitive.kind === "resource" && primitive.mimeType && (
          <Tag variant="mimeType">{primitive.mimeType}</Tag>
        )}
        {primitive.kind === "tool" && <AnnotationTags annotations={primitive.annotations} />}
      </div>

      {/* Body */}
      <div style={styles.body} data-testid="primitive-detail-body">
        {/* Summary (always visible) */}
        {summary && <p style={styles.summary}>{summary}</p>}

        {/* Collapsible description - only if different from summary or has more detail */}
        {primitive.description && primitive.description.includes("\n") && (
          <CollapsibleDescription description={primitive.description} />
        )}

        {/* URI (resources only) */}
        {primitive.kind === "resource" && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>URI</div>
            <div style={styles.uriBox} data-testid="resource-uri">
              {primitive.uri}
            </div>
          </div>
        )}

        {/* Parameters (tools only) */}
        {primitive.kind === "tool" && primitive.inputSchema?.properties && (
          <ParametersSection
            properties={primitive.inputSchema.properties}
            required={primitive.inputSchema.required}
          />
        )}

        {/* Arguments (prompts only) */}
        {primitive.kind === "prompt" && primitive.arguments && primitive.arguments.length > 0 && (
          <ArgumentsSection args={primitive.arguments} />
        )}
      </div>

      {/* Footer */}
      <div style={styles.footer} data-testid="primitive-detail-footer">
        <CopyJsonButton data={primitiveData} />
        <button
          style={{ ...styles.button, ...styles.buttonPrimary }}
          onClick={handleAction}
          data-testid="action-btn"
        >
          {icon} {label}
        </button>
      </div>
    </div>
  );
}

export default PrimitiveDetail;
