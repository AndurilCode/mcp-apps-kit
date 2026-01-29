/**
 * JsonViewer Component
 *
 * A simple collapsible JSON tree viewer for displaying event payloads.
 * Features:
 * - Expandable objects/arrays
 * - Syntax highlighting for types (string, number, boolean, null)
 * - Truncates long strings
 * - Max initial depth of 2 levels
 */

import React, { useState, useCallback } from "react";
import { styles } from "../styles";

export interface JsonViewerProps {
  /** The JSON data to display */
  data: unknown;
  /** Maximum string length before truncation (default: 100) */
  maxStringLength?: number;
  /** Initial depth to expand (default: 2) */
  initialExpandDepth?: number;
}

interface JsonNodeProps {
  value: unknown;
  depth: number;
  initialExpandDepth: number;
  maxStringLength: number;
  keyName?: string;
  isLast?: boolean;
}

function JsonNode({
  value,
  depth,
  initialExpandDepth,
  maxStringLength,
  keyName,
  isLast = true,
}: JsonNodeProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(depth < initialExpandDepth);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const indent = { paddingLeft: `${depth * 0.75}rem` };

  // Handle null
  if (value === null) {
    return (
      <div style={{ ...styles.jsonLine, ...indent }}>
        {keyName !== undefined && (
          <>
            <span style={styles.jsonKey}>"{keyName}"</span>
            <span style={styles.jsonColon}>:</span>
          </>
        )}
        <span style={styles.jsonNull}>null</span>
        {!isLast && <span style={styles.jsonBracket}>,</span>}
      </div>
    );
  }

  // Handle undefined
  if (value === undefined) {
    return (
      <div style={{ ...styles.jsonLine, ...indent }}>
        {keyName !== undefined && (
          <>
            <span style={styles.jsonKey}>"{keyName}"</span>
            <span style={styles.jsonColon}>:</span>
          </>
        )}
        <span style={styles.jsonNull}>undefined</span>
        {!isLast && <span style={styles.jsonBracket}>,</span>}
      </div>
    );
  }

  // Handle primitives
  const type = typeof value;

  if (type === "string") {
    const strValue = value as string;
    const truncated = strValue.length > maxStringLength;
    const displayValue = truncated ? strValue.slice(0, maxStringLength) + "..." : strValue;
    const escapedValue = displayValue.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

    return (
      <div style={{ ...styles.jsonLine, ...indent }}>
        {keyName !== undefined && (
          <>
            <span style={styles.jsonKey}>"{keyName}"</span>
            <span style={styles.jsonColon}>:</span>
          </>
        )}
        <span style={styles.jsonString}>"{escapedValue}"</span>
        {!isLast && <span style={styles.jsonBracket}>,</span>}
      </div>
    );
  }

  if (type === "number") {
    return (
      <div style={{ ...styles.jsonLine, ...indent }}>
        {keyName !== undefined && (
          <>
            <span style={styles.jsonKey}>"{keyName}"</span>
            <span style={styles.jsonColon}>:</span>
          </>
        )}
        <span style={styles.jsonNumber}>{String(value)}</span>
        {!isLast && <span style={styles.jsonBracket}>,</span>}
      </div>
    );
  }

  if (type === "boolean") {
    return (
      <div style={{ ...styles.jsonLine, ...indent }}>
        {keyName !== undefined && (
          <>
            <span style={styles.jsonKey}>"{keyName}"</span>
            <span style={styles.jsonColon}>:</span>
          </>
        )}
        <span style={styles.jsonBoolean}>{String(value)}</span>
        {!isLast && <span style={styles.jsonBracket}>,</span>}
      </div>
    );
  }

  // Handle arrays
  if (Array.isArray(value)) {
    const items = value as unknown[];
    const isEmpty = items.length === 0;

    if (isEmpty) {
      return (
        <div style={{ ...styles.jsonLine, ...indent }}>
          {keyName !== undefined && (
            <>
              <span style={styles.jsonKey}>"{keyName}"</span>
              <span style={styles.jsonColon}>:</span>
            </>
          )}
          <span style={styles.jsonBracket}>[]</span>
          {!isLast && <span style={styles.jsonBracket}>,</span>}
        </div>
      );
    }

    return (
      <>
        <div style={{ ...styles.jsonLine, ...indent }}>
          <button style={styles.jsonExpandBtn} onClick={toggleExpand}>
            {isExpanded ? "▼" : "▶"}
          </button>
          {keyName !== undefined && (
            <>
              <span style={styles.jsonKey}>"{keyName}"</span>
              <span style={styles.jsonColon}>:</span>
            </>
          )}
          <span style={styles.jsonBracket}>[</span>
          {!isExpanded && (
            <>
              <span style={styles.jsonEllipsis}> {items.length} items </span>
              <span style={styles.jsonBracket}>]</span>
              {!isLast && <span style={styles.jsonBracket}>,</span>}
            </>
          )}
        </div>
        {isExpanded && (
          <>
            {items.map((item, index) => (
              <JsonNode
                key={index}
                value={item}
                depth={depth + 1}
                initialExpandDepth={initialExpandDepth}
                maxStringLength={maxStringLength}
                isLast={index === items.length - 1}
              />
            ))}
            <div style={{ ...styles.jsonLine, ...indent }}>
              <span style={styles.jsonBracket}>]</span>
              {!isLast && <span style={styles.jsonBracket}>,</span>}
            </div>
          </>
        )}
      </>
    );
  }

  // Handle objects
  if (type === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    const isEmpty = keys.length === 0;

    if (isEmpty) {
      return (
        <div style={{ ...styles.jsonLine, ...indent }}>
          {keyName !== undefined && (
            <>
              <span style={styles.jsonKey}>"{keyName}"</span>
              <span style={styles.jsonColon}>:</span>
            </>
          )}
          <span style={styles.jsonBracket}>{"{}"}</span>
          {!isLast && <span style={styles.jsonBracket}>,</span>}
        </div>
      );
    }

    return (
      <>
        <div style={{ ...styles.jsonLine, ...indent }}>
          <button style={styles.jsonExpandBtn} onClick={toggleExpand}>
            {isExpanded ? "▼" : "▶"}
          </button>
          {keyName !== undefined && (
            <>
              <span style={styles.jsonKey}>"{keyName}"</span>
              <span style={styles.jsonColon}>:</span>
            </>
          )}
          <span style={styles.jsonBracket}>{"{"}</span>
          {!isExpanded && (
            <>
              <span style={styles.jsonEllipsis}> {keys.length} keys </span>
              <span style={styles.jsonBracket}>{"}"}</span>
              {!isLast && <span style={styles.jsonBracket}>,</span>}
            </>
          )}
        </div>
        {isExpanded && (
          <>
            {keys.map((key, index) => (
              <JsonNode
                key={key}
                keyName={key}
                value={obj[key] ?? null}
                depth={depth + 1}
                initialExpandDepth={initialExpandDepth}
                maxStringLength={maxStringLength}
                isLast={index === keys.length - 1}
              />
            ))}
            <div style={{ ...styles.jsonLine, ...indent }}>
              <span style={styles.jsonBracket}>{"}"}</span>
              {!isLast && <span style={styles.jsonBracket}>,</span>}
            </div>
          </>
        )}
      </>
    );
  }

  // Fallback for unknown types
  return (
    <div style={{ ...styles.jsonLine, ...indent }}>
      {keyName !== undefined && (
        <>
          <span style={styles.jsonKey}>"{keyName}"</span>
          <span style={styles.jsonColon}>:</span>
        </>
      )}
      <span>{String(value)}</span>
      {!isLast && <span style={styles.jsonBracket}>,</span>}
    </div>
  );
}

export function JsonViewer({
  data,
  maxStringLength = 100,
  initialExpandDepth = 2,
}: JsonViewerProps): React.ReactElement {
  return (
    <div style={styles.jsonContainer}>
      <JsonNode
        value={data}
        depth={0}
        initialExpandDepth={initialExpandDepth}
        maxStringLength={maxStringLength}
      />
    </div>
  );
}

export default JsonViewer;
