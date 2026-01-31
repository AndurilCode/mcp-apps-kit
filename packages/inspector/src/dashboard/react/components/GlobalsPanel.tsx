/**
 * GlobalsPanel Component
 *
 * Displays environment/globals information in a horizontal bar.
 */

import React from "react";
import type { GlobalsState } from "../hooks/useGlobals";
import { styles } from "../styles";

export interface GlobalsPanelProps {
  /** The current globals/environment state */
  globals: GlobalsState | null;
  /** Whether the panel is visible */
  isVisible: boolean;
  /** Whether the panel is collapsed */
  isCollapsed: boolean;
  /** Callback to toggle collapsed state */
  onToggleCollapse?: () => void;
}

interface ItemProps {
  label: string;
  value: string | number | undefined | null;
}

function Item({ label, value }: ItemProps): React.ReactElement | null {
  if (value === undefined || value === null) return null;
  return (
    <div style={styles.globalsBarItem}>
      <span style={styles.globalsBarItemLabel}>{label}</span>
      <span style={styles.globalsBarItemValue}>{String(value)}</span>
    </div>
  );
}

export function GlobalsPanel({
  globals,
  isVisible,
  isCollapsed,
  onToggleCollapse,
}: GlobalsPanelProps): React.ReactElement {
  if (!isVisible) {
    return <div style={{ display: "none" }} />;
  }

  const panelStyle: React.CSSProperties = {
    ...styles.globalsBar,
    ...(isCollapsed ? styles.globalsBarCollapsed : {}),
  };

  if (!globals) {
    return (
      <div style={panelStyle}>
        {isCollapsed ? (
          <div style={styles.globalsBarCollapsedContent}>
            <button
              style={styles.globalsBarExpandBtn}
              onClick={onToggleCollapse}
              disabled={!onToggleCollapse}
            >
              Show Environment
            </button>
          </div>
        ) : (
          <div style={styles.globalsBarContent}>
            <span style={styles.globalsBarLoading}>Loading environment…</span>
          </div>
        )}
      </div>
    );
  }

  const {
    theme,
    displayMode,
    locale,
    timeZone,
    viewport,
    maxHeight,
    safeAreaInsets,
    userAgent,
    userLocation,
  } = globals;

  return (
    <div style={panelStyle}>
      {isCollapsed ? (
        <div style={styles.globalsBarCollapsedContent}>
          <button
            style={styles.globalsBarExpandBtn}
            onClick={onToggleCollapse}
            disabled={!onToggleCollapse}
          >
            Show Environment
          </button>
        </div>
      ) : (
        <div style={styles.globalsBarContent}>
          <Item label="Theme" value={theme} />
          <Item label="Display" value={displayMode} />
          <Item label="Locale" value={locale} />
          <Item label="Timezone" value={timeZone} />
          <Item label="Viewport" value={`${viewport.width} × ${viewport.height}`} />
          {maxHeight !== undefined && <Item label="Max H" value={`${maxHeight}px`} />}
          <Item
            label="Safe Area"
            value={`T:${safeAreaInsets.top} R:${safeAreaInsets.right} B:${safeAreaInsets.bottom} L:${safeAreaInsets.left}`}
          />
          <Item label="Device" value={userAgent.device?.type ?? "unknown"} />
          <Item label="Hover" value={userAgent.capabilities?.hover ? "Yes" : "No"} />
          <Item label="Touch" value={userAgent.capabilities?.touch ? "Yes" : "No"} />
          {userLocation?.city && <Item label="City" value={userLocation.city} />}
          {userLocation?.region && <Item label="Region" value={userLocation.region} />}
          {userLocation?.country && <Item label="Country" value={userLocation.country} />}
          {userLocation?.timezone && <Item label="TZ" value={userLocation.timezone} />}
        </div>
      )}
    </div>
  );
}

export default GlobalsPanel;
