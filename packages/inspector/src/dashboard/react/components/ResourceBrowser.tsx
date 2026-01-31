/**
 * ResourceBrowser Component
 *
 * Interactive resource browser for human mode.
 * Displays a list of MCP resources and lets the user read their content.
 */

import React, { useState, useCallback } from "react";
import type { McpResource } from "../types/mcp-primitives";
import { useResourceReader, type ResourceContent } from "../hooks/useResourceReader";

// =============================================================================
// Types
// =============================================================================

interface ResourceBrowserProps {
  resources: McpResource[];
  baseUrl: string;
  connectionId: string | null;
}

// =============================================================================
// Local Styles
// =============================================================================

const localStyles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    height: "100%",
    overflow: "auto",
  },
  card: {
    backgroundColor: "#111111",
    border: "1px solid #2d2f2f",
    borderRadius: "6px",
    padding: "0.75rem",
    transition: "border-color 0.15s ease",
  },
  cardHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "0.5rem",
  },
  cardInfo: {
    flex: 1,
    minWidth: 0,
  },
  cardName: {
    fontSize: "0.8125rem",
    fontWeight: 600,
    color: "#e0e0e0",
    fontFamily:
      "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
  },
  cardDescription: {
    fontSize: "0.6875rem",
    color: "#9ca3af",
    marginTop: "0.25rem",
    lineHeight: 1.5,
  },
  cardUri: {
    fontFamily:
      "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
    fontSize: "0.625rem",
    color: "#ce9178",
    backgroundColor: "rgba(206, 145, 120, 0.1)",
    padding: "0.25rem 0.5rem",
    borderRadius: "4px",
    marginTop: "0.5rem",
    wordBreak: "break-all" as const,
  },
  cardMeta: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginTop: "0.5rem",
  },
  mimeTag: {
    display: "inline-block",
    fontSize: "0.5625rem",
    color: "#569cd6",
    backgroundColor: "rgba(86, 156, 214, 0.1)",
    padding: "0.125rem 0.375rem",
    borderRadius: "3px",
  },
  readBtn: {
    fontFamily: "inherit",
    fontSize: "0.6875rem",
    fontWeight: 600,
    backgroundColor: "#20b2aa",
    color: "#0a0a0a",
    border: "none",
    borderRadius: "4px",
    padding: "0.375rem 0.75rem",
    cursor: "pointer",
    transition: "all 0.15s ease",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
  },
  readBtnDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  contentViewer: {
    marginTop: "0.75rem",
    backgroundColor: "#0a0a0a",
    border: "1px solid #2d2f2f",
    borderRadius: "6px",
    overflow: "hidden",
  },
  contentHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.5rem 0.75rem",
    backgroundColor: "rgba(32, 178, 170, 0.05)",
    borderBottom: "1px solid #2d2f2f",
    fontSize: "0.625rem",
    color: "#9ca3af",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    fontWeight: 600,
  },
  contentBody: {
    padding: "0.75rem",
    maxHeight: "300px",
    overflowY: "auto" as const,
  },
  contentText: {
    fontFamily:
      "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
    fontSize: "0.6875rem",
    color: "#e0e0e0",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    lineHeight: 1.6,
    margin: 0,
  },
  errorBanner: {
    fontSize: "0.6875rem",
    color: "#ff6b6b",
    backgroundColor: "rgba(255, 107, 107, 0.1)",
    border: "1px solid rgba(255, 107, 107, 0.2)",
    borderRadius: "4px",
    padding: "0.5rem 0.75rem",
    marginTop: "0.5rem",
  },
  spinner: {
    width: "12px",
    height: "12px",
    border: "2px solid rgba(10, 10, 10, 0.3)",
    borderTopColor: "#0a0a0a",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
    display: "inline-block",
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
};

// =============================================================================
// Content Renderer
// =============================================================================

function ContentBlock({ content }: { content: ResourceContent }): React.ReactElement {
  // Try to detect and format JSON
  const displayText = content.text ?? content.blob ?? "";
  let formatted = displayText;
  try {
    const parsed = JSON.parse(displayText);
    formatted = JSON.stringify(parsed, null, 2);
  } catch {
    // Not JSON, display as-is
  }

  return (
    <div style={localStyles.contentViewer}>
      <div style={localStyles.contentHeader}>
        <span>{content.uri}</span>
        {content.mimeType && <span>{content.mimeType}</span>}
      </div>
      <div style={localStyles.contentBody}>
        <pre style={localStyles.contentText}>{formatted}</pre>
      </div>
    </div>
  );
}

// =============================================================================
// Resource Card with Read Action
// =============================================================================

function ResourceRow({
  resource,
  baseUrl,
  connectionId,
}: {
  resource: McpResource;
  baseUrl: string;
  connectionId: string | null;
}): React.ReactElement {
  const { read, isReading, lastContent, error } = useResourceReader(baseUrl, connectionId);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleRead = useCallback(async () => {
    await read(resource.uri);
    setIsExpanded(true);
  }, [read, resource.uri]);

  return (
    <div style={localStyles.card}>
      <div style={localStyles.cardHeader}>
        <div style={localStyles.cardInfo}>
          <div style={localStyles.cardName}>{resource.name}</div>
          {resource.description && (
            <div style={localStyles.cardDescription}>{resource.description}</div>
          )}
        </div>
        <button
          style={{
            ...localStyles.readBtn,
            ...(isReading ? localStyles.readBtnDisabled : {}),
          }}
          onClick={() => void handleRead()}
          disabled={isReading}
        >
          {isReading && <span style={localStyles.spinner} />}
          {isReading ? "Reading…" : "Read"}
        </button>
      </div>

      <div style={localStyles.cardUri}>{resource.uri}</div>

      <div style={localStyles.cardMeta}>
        {resource.mimeType && <span style={localStyles.mimeTag}>{resource.mimeType}</span>}
      </div>

      {error && <div style={localStyles.errorBanner}>{error}</div>}

      {isExpanded &&
        lastContent &&
        lastContent.contents.map((c, i) => <ContentBlock key={i} content={c} />)}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function ResourceBrowser({
  resources,
  baseUrl,
  connectionId,
}: ResourceBrowserProps): React.ReactElement {
  if (resources.length === 0) {
    return <div style={localStyles.emptyState}>No resources available</div>;
  }

  return (
    <div style={localStyles.container}>
      {resources.map((resource) => (
        <ResourceRow
          key={resource.uri}
          resource={resource}
          baseUrl={baseUrl}
          connectionId={connectionId}
        />
      ))}
    </div>
  );
}

export default ResourceBrowser;
