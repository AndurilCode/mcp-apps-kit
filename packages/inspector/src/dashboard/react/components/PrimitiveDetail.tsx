/**
 * PrimitiveDetail Component
 *
 * Displays detailed information about a selected MCP primitive (tool, resource, or prompt).
 * Browse mode shows read-only details; action mode allows execution.
 */

import React, { useState, useCallback, useEffect } from "react";
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

/** Content block in tool/resource results */
export interface ContentBlock {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}

/** Resource content in read results */
export interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

/** Message in prompt results */
export interface PromptMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

/** Execution result metadata */
export interface ExecutionMeta {
  requestId?: string;
  serverName?: string;
  duration_ms?: number;
  cached?: boolean;
  promptName?: string;
  [key: string]: unknown;
}

/** Execution result type */
export interface ExecutionResult {
  ok: boolean;
  error?: string;
  content?: ContentBlock[];
  contents?: ResourceContent[];
  messages?: PromptMessage[];
  structuredContent?: unknown;
  _meta?: ExecutionMeta;
}

/** Execute function signature */
export type ExecuteFn = (
  primitive: Primitive,
  params: Record<string, unknown>
) => Promise<ExecutionResult>;

/** Props for the PrimitiveDetail component */
export interface PrimitiveDetailProps {
  /** The primitive to display */
  primitive: Primitive;
  /** Callback when action button is clicked (browse mode) - for external mode management */
  onAction?: (primitive: Primitive) => void;
  /** Callback to execute the primitive - if not provided, mock execution is used */
  onExecute?: ExecuteFn;
  /** Callback when back/close is requested */
  onClose?: () => void;
}

// =============================================================================
// Mock Data
// =============================================================================

const MOCK_TOOL_RESULT: ExecutionResult = {
  ok: true,
  content: [
    {
      type: "text",
      text: "# Weekly Sync Notes\n\nAttendees: @alice, @bob\n\n## Updates\n- Project Alpha: on track\n- Project Beta: blocked on API review",
    },
  ],
  structuredContent: {
    page: {
      id: "a1b2c3d4",
      title: "Weekly Sync Notes",
      type: "page",
      properties: { Status: "Active", Tags: ["meetings", "weekly"] },
    },
  },
  _meta: { requestId: "req_8f3a2b1c", serverName: "mock-mcp", duration_ms: 243, cached: false },
};

const MOCK_RESOURCE_RESULT: ExecutionResult = {
  ok: true,
  contents: [
    {
      uri: "mock://docs/spec",
      mimeType: "text/markdown",
      text: "# Enhanced Markdown Spec v2.1\n\n## Callouts\nUse > [!type] syntax\n\n## Toggle Blocks\nWrapped in <details> tags",
    },
  ],
  _meta: { requestId: "req_4d7e9f2a", serverName: "mock-mcp", duration_ms: 87, cached: true },
};

const MOCK_PROMPT_RESULT: ExecutionResult = {
  ok: true,
  messages: [
    {
      role: "user",
      content:
        "Please summarize the following page.\n\nPage URL: https://example.com/page\nStyle: brief",
    },
  ],
  _meta: { requestId: "req_1c5b8e3d", serverName: "mock-mcp", promptName: "summarize-page" },
};

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
  tagActionMode: {
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    borderColor: "#22c55e",
    color: "#22c55e",
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
  buttonDisabled: {
    backgroundColor: "transparent",
    border: "1px solid #3d4040",
    color: "#6b7280",
    cursor: "not-allowed",
  },
  copySuccess: {
    borderColor: "#22c55e",
    color: "#22c55e",
    backgroundColor: "rgba(34, 197, 94, 0.1)",
  },
  // Form styles
  formField: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  input: {
    fontFamily: FONT_MONO,
    fontSize: "0.75rem",
    padding: "8px 12px",
    backgroundColor: "#1a1a1a",
    border: "1px solid #3d4040",
    borderRadius: "4px",
    color: "#e8e8e8",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },
  textarea: {
    fontFamily: FONT_MONO,
    fontSize: "0.75rem",
    padding: "8px 12px",
    backgroundColor: "#1a1a1a",
    border: "1px solid #3d4040",
    borderRadius: "4px",
    color: "#e8e8e8",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    resize: "vertical",
    minHeight: "80px",
  },
  toggleButton: {
    fontFamily: "inherit",
    fontSize: "0.75rem",
    padding: "8px 16px",
    borderRadius: "4px",
    cursor: "pointer",
    transition: "all 0.15s ease",
    border: "1px solid #3d4040",
    backgroundColor: "transparent",
    color: "#9ca3af",
  },
  toggleButtonActive: {
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    borderColor: "#22c55e",
    color: "#22c55e",
  },
  // Response panel styles
  responsePanel: {
    marginTop: "8px",
  },
  responsePanelTitle: {
    fontSize: "0.6875rem",
    fontWeight: 600,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "8px",
  },
  responseBox: {
    border: "1px solid #2d2f2f",
    borderRadius: "4px",
    overflow: "hidden",
  },
  responseStatus: {
    padding: "8px 12px",
    borderBottom: "1px solid #2d2f2f",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "0.75rem",
  },
  statusDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    border: "1px solid #9ca3af",
  },
  statusDotSuccess: {
    backgroundColor: "transparent",
    borderColor: "#22c55e",
  },
  statusDotError: {
    backgroundColor: "#ef4444",
    borderColor: "#ef4444",
  },
  statusText: {
    color: "#d1d5db",
  },
  durationText: {
    marginLeft: "auto",
    fontSize: "0.6875rem",
    color: "#6b7280",
  },
  responseSection: {
    borderTop: "1px solid #2d2f2f",
  },
  responseSectionHeader: {
    padding: "8px 12px",
    cursor: "pointer",
    fontSize: "0.75rem",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: "transparent",
    border: "none",
    width: "100%",
    textAlign: "left",
    color: "#d1d5db",
  },
  responseSectionTitle: {
    fontWeight: 600,
    flex: 1,
  },
  responseSectionHint: {
    fontSize: "0.625rem",
    color: "#6b7280",
  },
  responseSectionContent: {
    padding: "0 12px 12px",
  },
  contentBlock: {
    marginBottom: "8px",
  },
  contentBlockFirst: {
    marginBottom: "8px",
  },
  preText: {
    fontFamily: FONT_MONO,
    fontSize: "0.6875rem",
    color: "#d1d5db",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    lineHeight: 1.6,
    margin: "4px 0 0",
    padding: "8px",
    backgroundColor: "#0d0e0e",
    borderRadius: "4px",
    border: "1px solid #1a1a1a",
  },
  metaRow: {
    display: "flex",
    gap: "12px",
    fontSize: "0.6875rem",
    padding: "2px 0",
    color: "#d1d5db",
  },
  metaKey: {
    minWidth: "100px",
    color: "#6b7280",
  },
  loadingSpinner: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    color: "#9ca3af",
    fontSize: "0.75rem",
  },
  // Form footer buttons
  formFooter: {
    display: "flex",
    gap: "8px",
    paddingTop: "8px",
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

/**
 * Get mock result based on primitive kind
 */
function getMockResult(kind: Primitive["kind"]): ExecutionResult {
  switch (kind) {
    case "tool":
      return MOCK_TOOL_RESULT;
    case "resource":
      return MOCK_RESOURCE_RESULT;
    case "prompt":
      return MOCK_PROMPT_RESULT;
  }
}

/**
 * Determine input type for a parameter based on its JSON Schema type
 */
function getInputType(schemaType: string): "text" | "number" | "boolean" | "object" {
  switch (schemaType) {
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "object":
    case "array":
      return "object";
    default:
      return "text";
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
  variant?: "kind" | "readOnly" | "idempotent" | "destructive" | "mimeType" | "actionMode";
}): React.ReactElement {
  const variantStyles: Record<string, React.CSSProperties> = {
    kind: styles.tagKind!,
    readOnly: styles.tagReadOnly!,
    idempotent: styles.tagIdempotent!,
    destructive: styles.tagDestructive!,
    mimeType: styles.tagMimeType!,
    actionMode: styles.tagActionMode!,
  };

  return (
    <span style={{ ...styles.tag, ...(variant ? variantStyles[variant] : {}) }}>{children}</span>
  );
}

/** Collapsible description section */
function CollapsibleDescription({ description }: { description: string }): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);

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

/** Parameters section for tools (browse mode) */
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

/** Arguments section for prompts (browse mode) */
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

/** Loading spinner component */
function LoadingSpinner({ text }: { text: string }): React.ReactElement {
  return (
    <span style={styles.loadingSpinner} data-testid="loading-spinner">
      <span
        style={{
          display: "inline-block",
          width: "12px",
          height: "12px",
          border: "2px solid #3d4040",
          borderTopColor: "#9ca3af",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      {text}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}

// =============================================================================
// Response Panel
// =============================================================================

/** Collapsible section within the response panel */
function ResponseSection({
  label,
  defaultOpen,
  children,
}: {
  label: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div style={styles.responseSection}>
      <button
        style={styles.responseSectionHeader}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        data-testid={`response-section-${label}`}
      >
        <span style={styles.collapsibleIcon}>{isOpen ? "▾" : "▸"}</span>
        <span style={styles.responseSectionTitle}>{label}</span>
        <span style={styles.responseSectionHint}>{isOpen ? "collapse" : "expand"}</span>
      </button>
      {isOpen && <div style={styles.responseSectionContent}>{children}</div>}
    </div>
  );
}

/** Response panel showing execution results */
function ResponsePanel({ result }: { result: ExecutionResult }): React.ReactElement {
  const hasContent = !!(result.content || result.contents || result.messages);
  const hasStructured = result.structuredContent !== undefined;
  const hasMeta = result._meta !== undefined;

  return (
    <div style={styles.responsePanel} data-testid="response-panel">
      <div style={styles.responsePanelTitle}>Response</div>
      <div style={styles.responseBox}>
        {/* Status row */}
        <div style={styles.responseStatus}>
          <span
            style={{
              ...styles.statusDot,
              ...(result.ok ? styles.statusDotSuccess : styles.statusDotError),
            }}
          />
          <span style={styles.statusText}>{result.ok ? "Success" : "Error"}</span>
          {result._meta?.duration_ms !== undefined && (
            <span style={styles.durationText}>{result._meta.duration_ms as number}ms</span>
          )}
        </div>

        {/* Error message */}
        {result.error !== undefined && !result.ok && (
          <div style={{ padding: "8px 12px", color: "#ef4444", fontSize: "0.75rem" }}>
            {String(result.error)}
          </div>
        )}

        {/* Content section */}
        {hasContent && (
          <ResponseSection label="content" defaultOpen={true}>
            {/* Tool content blocks */}
            {result.content?.map((block, i) => (
              <div key={i} style={i > 0 ? styles.contentBlock : styles.contentBlockFirst}>
                <Tag>{block.type}</Tag>
                <pre style={styles.preText}>{block.text || block.data || ""}</pre>
              </div>
            ))}

            {/* Resource contents */}
            {result.contents?.map((item, i) => (
              <div key={i} style={i > 0 ? styles.contentBlock : styles.contentBlockFirst}>
                <Tag variant="mimeType">{item.mimeType || "unknown"}</Tag>
                <div style={{ fontSize: "0.625rem", color: "#6b7280", marginTop: "2px" }}>
                  {item.uri}
                </div>
                <pre style={styles.preText}>{item.text || ""}</pre>
              </div>
            ))}

            {/* Prompt messages */}
            {result.messages?.map((msg, i) => (
              <div key={i} style={i > 0 ? styles.contentBlock : styles.contentBlockFirst}>
                <Tag>{msg.role}</Tag>
                <pre style={styles.preText}>
                  {typeof msg.content === "string"
                    ? msg.content
                    : JSON.stringify(msg.content, null, 2)}
                </pre>
              </div>
            ))}
          </ResponseSection>
        )}

        {/* Structured content section */}
        {hasStructured && (
          <ResponseSection label="structuredContent" defaultOpen={false}>
            <pre style={styles.preText}>{JSON.stringify(result.structuredContent, null, 2)}</pre>
          </ResponseSection>
        )}

        {/* Meta section */}
        {hasMeta && result._meta && (
          <ResponseSection label="_meta" defaultOpen={false}>
            {Object.entries(result._meta).map(([key, value]) => (
              <div key={key} style={styles.metaRow}>
                <span style={styles.metaKey}>{key}</span>
                <span>
                  {typeof value === "object" ? JSON.stringify(value) : String(value as string)}
                </span>
              </div>
            ))}
          </ResponseSection>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Action Mode Forms
// =============================================================================

/** Tool Run Form */
function ToolRunForm({
  tool,
  onExecute,
  onClose,
}: {
  tool: McpTool & { kind: "tool" };
  onExecute?: ExecuteFn;
  onClose: () => void;
}): React.ReactElement {
  const properties = tool.inputSchema?.properties || {};
  const required = tool.inputSchema?.required || [];

  // Initialize form values based on parameter types
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const [name, prop] of Object.entries(properties)) {
      const inputType = getInputType(prop.type);
      if (inputType === "boolean") {
        initial[name] = false;
      } else if (inputType === "number") {
        initial[name] = "";
      } else {
        initial[name] = "";
      }
    }
    return initial;
  });

  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);

  const setValue = (name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  // Check if all required fields are filled
  const isReady = required.every((name) => {
    const val = values[name];
    if (val === undefined || val === null || val === "") return false;
    return true;
  });

  const handleRun = async () => {
    setIsRunning(true);
    setResult(null);

    // Convert string values to proper types
    const params: Record<string, unknown> = {};
    for (const [name, prop] of Object.entries(properties)) {
      const val = values[name];
      const inputType = getInputType(prop.type);

      if (val === "" || val === undefined) continue;

      if (inputType === "number" && typeof val === "string") {
        params[name] = parseFloat(val);
      } else if (inputType === "object" && typeof val === "string") {
        try {
          params[name] = JSON.parse(val);
        } catch {
          params[name] = val; // Keep as string if invalid JSON
        }
      } else {
        params[name] = val;
      }
    }

    if (onExecute) {
      try {
        const res = await onExecute(tool, params);
        setResult(res);
      } catch (err) {
        setResult({ ok: false, error: String(err) });
      }
    } else {
      // Mock execution
      await new Promise((resolve) => setTimeout(resolve, 500));
      setResult(getMockResult("tool"));
    }

    setIsRunning(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {Object.entries(properties).map(([name, prop]) => {
        const inputType = getInputType(prop.type);
        const isRequired = required.includes(name);

        return (
          <div key={name} style={styles.formField} data-testid={`form-field-${name}`}>
            <div style={styles.paramHeader}>
              <span style={styles.paramName}>{name}</span>
              <span style={styles.paramType}>{formatType(prop)}</span>
              <span style={isRequired ? styles.paramRequired : styles.paramOptional}>
                {isRequired ? "required" : "optional"}
              </span>
            </div>
            {prop.description && <div style={styles.paramDesc}>{prop.description}</div>}

            {inputType === "boolean" ? (
              <button
                type="button"
                style={{
                  ...styles.toggleButton,
                  ...(values[name] ? styles.toggleButtonActive : {}),
                }}
                onClick={() => setValue(name, !values[name])}
                data-testid={`input-${name}`}
              >
                {String(values[name])}
              </button>
            ) : inputType === "object" ? (
              <textarea
                style={styles.textarea as React.CSSProperties}
                value={String(values[name] || "")}
                onChange={(e) => setValue(name, e.target.value)}
                placeholder="{}"
                data-testid={`input-${name}`}
              />
            ) : (
              <input
                type={inputType === "number" ? "number" : "text"}
                style={styles.input as React.CSSProperties}
                value={String(values[name] || "")}
                onChange={(e) => setValue(name, e.target.value)}
                placeholder={`Enter ${name}…`}
                data-testid={`input-${name}`}
              />
            )}
          </div>
        );
      })}

      <div style={styles.formFooter}>
        <button
          type="button"
          disabled={!isReady || isRunning}
          onClick={handleRun}
          style={{
            ...styles.button,
            ...(isReady && !isRunning ? styles.buttonPrimary : styles.buttonDisabled),
          }}
          data-testid="run-btn"
        >
          {isRunning ? <LoadingSpinner text="Running…" /> : "▶ Run"}
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{ ...styles.button, ...styles.buttonSecondary }}
          data-testid="back-btn"
        >
          Back
        </button>
      </div>

      {result && <ResponsePanel result={result} />}
    </div>
  );
}

/** Resource Read Form */
function ResourceReadForm({
  resource,
  onExecute,
  onClose,
}: {
  resource: McpResource & { kind: "resource" };
  onExecute?: ExecuteFn;
  onClose: () => void;
}): React.ReactElement {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);

  const handleRead = async () => {
    setIsLoading(true);
    setResult(null);

    if (onExecute) {
      try {
        const res = await onExecute(resource, { uri: resource.uri });
        setResult(res);
      } catch (err) {
        setResult({ ok: false, error: String(err) });
      }
    } else {
      // Mock execution
      await new Promise((resolve) => setTimeout(resolve, 500));
      setResult(getMockResult("resource"));
    }

    setIsLoading(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={styles.section}>
        <div style={styles.sectionTitle}>URI</div>
        <div style={styles.uriBox} data-testid="resource-uri">
          {resource.uri}
        </div>
      </div>

      <div style={styles.formFooter}>
        <button
          type="button"
          disabled={isLoading}
          onClick={handleRead}
          style={{
            ...styles.button,
            ...(isLoading ? styles.buttonDisabled : styles.buttonPrimary),
          }}
          data-testid="read-btn"
        >
          {isLoading ? <LoadingSpinner text="Reading…" /> : "↓ Read"}
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{ ...styles.button, ...styles.buttonSecondary }}
          data-testid="back-btn"
        >
          Back
        </button>
      </div>

      {result && <ResponsePanel result={result} />}
    </div>
  );
}

/** Prompt Use Form */
function PromptUseForm({
  prompt,
  onExecute,
  onClose,
}: {
  prompt: McpPrompt & { kind: "prompt" };
  onExecute?: ExecuteFn;
  onClose: () => void;
}): React.ReactElement {
  const args = prompt.arguments || [];

  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const arg of args) {
      initial[arg.name] = "";
    }
    return initial;
  });

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);

  const setValue = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  // Check if all required args are filled
  const isReady = args.filter((a) => a.required).every((a) => values[a.name] !== "");

  const handleUse = async () => {
    setIsLoading(true);
    setResult(null);

    // Build params from non-empty values
    const params: Record<string, unknown> = {};
    for (const [name, val] of Object.entries(values)) {
      if (val !== "") params[name] = val;
    }

    if (onExecute) {
      try {
        const res = await onExecute(prompt, params);
        setResult(res);
      } catch (err) {
        setResult({ ok: false, error: String(err) });
      }
    } else {
      // Mock execution
      await new Promise((resolve) => setTimeout(resolve, 500));
      setResult(getMockResult("prompt"));
    }

    setIsLoading(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {args.map((arg) => (
        <div key={arg.name} style={styles.formField} data-testid={`form-field-${arg.name}`}>
          <div style={styles.paramHeader}>
            <span style={styles.paramName}>{arg.name}</span>
            <span style={arg.required ? styles.paramRequired : styles.paramOptional}>
              {arg.required ? "required" : "optional"}
            </span>
          </div>
          {arg.description && <div style={styles.paramDesc}>{arg.description}</div>}
          <input
            type="text"
            style={styles.input as React.CSSProperties}
            value={values[arg.name]}
            onChange={(e) => setValue(arg.name, e.target.value)}
            placeholder={`Enter ${arg.name}…`}
            data-testid={`input-${arg.name}`}
          />
        </div>
      ))}

      <div style={styles.formFooter}>
        <button
          type="button"
          disabled={!isReady || isLoading}
          onClick={handleUse}
          style={{
            ...styles.button,
            ...(isReady && !isLoading ? styles.buttonPrimary : styles.buttonDisabled),
          }}
          data-testid="use-btn"
        >
          {isLoading ? <LoadingSpinner text="Loading…" /> : "→ Use"}
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{ ...styles.button, ...styles.buttonSecondary }}
          data-testid="back-btn"
        >
          Back
        </button>
      </div>

      {result && <ResponsePanel result={result} />}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * PrimitiveDetail displays detailed information about a selected MCP primitive.
 *
 * Modes:
 * - browse: Read-only view of the primitive definition
 * - action: Form to execute the primitive with inputs and response panel
 */
export function PrimitiveDetail({
  primitive,
  onAction,
  onExecute,
  onClose,
}: PrimitiveDetailProps): React.ReactElement {
  const [mode, setMode] = useState<"browse" | "action">("browse");

  const handleClose = useCallback(() => {
    if (onClose) {
      onClose();
    }
  }, [onClose]);

  // Reset mode when primitive changes
  useEffect(() => {
    setMode("browse");
  }, [primitive.name, primitive.kind]);

  const summary = getSummary(primitive);
  const { icon, label } = getActionLabel(primitive.kind);

  // Extract data without the kind field for JSON export
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { kind, ...primitiveData } = primitive;

  const handleActionClick = useCallback(() => {
    // If external handler wants to manage mode, call it
    if (onAction) {
      onAction(primitive);
    }
    // Switch to action mode
    setMode("action");
  }, [onAction, primitive]);

  const handleBack = useCallback(() => {
    setMode("browse");
  }, []);

  return (
    <div style={styles.container} data-testid="primitive-detail">
      {/* Header */}
      <div style={styles.header} data-testid="primitive-detail-header">
        <h2 style={styles.name}>{primitive.name}</h2>
        <Tag variant="kind">{primitive.kind}</Tag>
        {primitive.kind === "resource" && primitive.mimeType && (
          <Tag variant="mimeType">{primitive.mimeType}</Tag>
        )}
        {mode === "action" && <Tag variant="actionMode">{label.toLowerCase()} mode</Tag>}
        {/* Right side: annotations + close button */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
          {mode === "browse" && primitive.kind === "tool" && (
            <AnnotationTags annotations={primitive.annotations} />
          )}
          {onClose && (
            <button
              style={{ ...styles.button, ...styles.buttonSecondary }}
              onClick={handleClose}
              title="Close"
              data-testid="close-btn"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={styles.body} data-testid="primitive-detail-body">
        {/* Browse Mode */}
        {mode === "browse" && (
          <>
            {/* Summary/Description */}
            {summary && <p style={styles.summary}>{summary}</p>}

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
            {primitive.kind === "prompt" &&
              primitive.arguments &&
              primitive.arguments.length > 0 && <ArgumentsSection args={primitive.arguments} />}
          </>
        )}

        {/* Action Mode - Tool */}
        {mode === "action" && primitive.kind === "tool" && (
          <ToolRunForm tool={primitive} onExecute={onExecute} onClose={handleBack} />
        )}

        {/* Action Mode - Resource */}
        {mode === "action" && primitive.kind === "resource" && (
          <ResourceReadForm resource={primitive} onExecute={onExecute} onClose={handleBack} />
        )}

        {/* Action Mode - Prompt */}
        {mode === "action" && primitive.kind === "prompt" && (
          <PromptUseForm prompt={primitive} onExecute={onExecute} onClose={handleBack} />
        )}
      </div>

      {/* Footer - only in browse mode */}
      {mode === "browse" && (
        <div style={styles.footer} data-testid="primitive-detail-footer">
          <CopyJsonButton data={primitiveData} />
          <button
            style={{ ...styles.button, ...styles.buttonDisabled }}
            disabled
            title="Coming soon"
            data-testid="action-btn"
          >
            {icon} {label}
          </button>
        </div>
      )}
    </div>
  );
}

export default PrimitiveDetail;
