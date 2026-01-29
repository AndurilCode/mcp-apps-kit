/**
 * GlobalsPanel Component
 *
 * Displays formatted environment/globals information in collapsible sections.
 */

import React from "react";
import type { GlobalsState } from "../hooks/useGlobals";
import { styles } from "../styles";

export interface GlobalsPanelProps {
  /** The current globals/environment state */
  globals: GlobalsState | null;
  /** Whether the panel is visible */
  isVisible: boolean;
  /** Panel width in pixels */
  width?: number;
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps): React.ReactElement {
  return (
    <div style={styles.globalsSection}>
      <div style={styles.globalsSectionTitle}>{title}</div>
      {children}
    </div>
  );
}

interface ItemProps {
  label: string;
  value: string | number | undefined | null;
}

function Item({ label, value }: ItemProps): React.ReactElement | null {
  if (value === undefined || value === null) return null;
  return (
    <div style={styles.globalsItem}>
      <span style={styles.globalsItemLabel}>{label}</span>
      <span style={styles.globalsItemValue}>{String(value)}</span>
    </div>
  );
}

export function GlobalsPanel({
  globals,
  isVisible,
  width = 280,
}: GlobalsPanelProps): React.ReactElement {
  const panelStyle: React.CSSProperties = {
    ...styles.globalsPanel,
    width: isVisible ? width : 0,
    ...(isVisible ? {} : styles.globalsPanelCollapsed),
  };

  if (!globals) {
    return (
      <div style={panelStyle}>
        {isVisible && (
          <>
            <div style={styles.globalsPanelHeader}>
              <span style={styles.globalsPanelTitle}>Environment</span>
            </div>
            <div style={styles.globalsPanelContent}>
              <div style={{ color: "#6b7280", textAlign: "center", padding: "1rem" }}>
                Loading...
              </div>
            </div>
          </>
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
      {isVisible && (
        <>
          <div style={styles.globalsPanelHeader}>
            <span style={styles.globalsPanelTitle}>Environment</span>
          </div>
          <div style={styles.globalsPanelContent}>
            <Section title="Display">
              <Item label="Theme" value={theme} />
              <Item label="Display Mode" value={displayMode} />
            </Section>

            <Section title="Locale">
              <Item label="Locale" value={locale} />
              <Item label="Timezone" value={timeZone} />
            </Section>

            <Section title="Viewport">
              <Item label="Dimensions" value={`${viewport.width} × ${viewport.height}`} />
              {maxHeight !== undefined && <Item label="Max Height" value={`${maxHeight}px`} />}
            </Section>

            <Section title="Safe Area">
              <Item
                label="Insets"
                value={`T:${safeAreaInsets.top} R:${safeAreaInsets.right} B:${safeAreaInsets.bottom} L:${safeAreaInsets.left}`}
              />
            </Section>

            <Section title="Device">
              <Item label="Type" value={userAgent.device?.type ?? "unknown"} />
              <Item label="Hover" value={userAgent.capabilities?.hover ? "Yes" : "No"} />
              <Item label="Touch" value={userAgent.capabilities?.touch ? "Yes" : "No"} />
            </Section>

            {userLocation && (
              <Section title="Location">
                {userLocation.city && <Item label="City" value={userLocation.city} />}
                {userLocation.region && <Item label="Region" value={userLocation.region} />}
                {userLocation.country && <Item label="Country" value={userLocation.country} />}
                {userLocation.timezone && <Item label="Timezone" value={userLocation.timezone} />}
              </Section>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default GlobalsPanel;
