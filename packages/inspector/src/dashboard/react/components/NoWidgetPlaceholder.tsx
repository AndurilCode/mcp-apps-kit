/**
 * NoWidgetPlaceholder Component
 *
 * Animated tamagotchi star placeholder for empty screencast state.
 */

import React from "react";
import { styles } from "../styles";

export function NoWidgetPlaceholder(): React.ReactElement {
  return (
    <div style={styles.noWidgetWrapper}>
      <svg
        viewBox="0 0 120 120"
        width="120"
        height="120"
        role="img"
        aria-label="Sirius the star"
        style={styles.noWidgetStar}
      >
        <defs>
          <linearGradient id="siriusGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0b3f3d" />
            <stop offset="50%" stopColor="#0f5c58" />
            <stop offset="100%" stopColor="#0a2d2b" />
          </linearGradient>
        </defs>
        <g style={styles.noWidgetStarFloat}>
          <polygon
            points="60,6 73,42 112,42 80,65 92,104 60,82 28,104 40,65 8,42 47,42"
            fill="url(#siriusGlow)"
            stroke="#20b2aa"
            strokeWidth="2"
          />
          <circle cx="46" cy="54" r="4" fill="#0b0d0d" style={styles.noWidgetEye} />
          <circle cx="74" cy="54" r="4" fill="#0b0d0d" style={styles.noWidgetEye} />
          <path
            d="M50 70 C55 76, 65 76, 70 70"
            stroke="#0b0d0d"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="34" cy="64" r="3" fill="rgba(32, 178, 170, 0.35)" />
          <circle cx="86" cy="64" r="3" fill="rgba(32, 178, 170, 0.35)" />
        </g>
      </svg>
      <p style={styles.noWidgetMessage}>No active widget yet — ask your agent to test</p>
    </div>
  );
}

export default NoWidgetPlaceholder;
