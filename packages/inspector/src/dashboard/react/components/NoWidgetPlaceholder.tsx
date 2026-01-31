/**
 * NoWidgetPlaceholder Component
 *
 * Crystalline 8-pointed star with perfect rotational symmetry.
 * Mathematically computed vertices for the compass rose shape.
 */

import React from "react";
import { styles } from "../styles";

// Perfectly symmetric 8-pointed star: 16 vertices alternating tips and valleys.
// Cardinal tips (N/E/S/W) at radius 88, diagonal tips at radius 62,
// valleys between each pair at radius 36. Center at (100,100).
const STAR_POINTS =
  "100,12 113.8,66.7 143.8,56.2 133.3,86.2 " +
  "188,100 133.3,113.8 143.8,143.8 113.8,133.3 " +
  "100,188 86.2,133.3 56.2,143.8 66.7,113.8 " +
  "12,100 66.7,86.2 56.2,56.2 86.2,66.7";

export function NoWidgetPlaceholder(): React.ReactElement {
  return (
    <div style={styles.noWidgetWrapper}>
      <svg
        viewBox="0 0 200 200"
        width="180"
        height="180"
        role="img"
        aria-label="Sirius the star"
        style={styles.noWidgetStar}
      >
        <defs>
          {/* Core glow — bright white to icy blue */}
          <radialGradient id="siriusCoreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="20%" stopColor="#e8f2ff" stopOpacity="0.95" />
            <stop offset="50%" stopColor="#a8c8e8" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#6b98be" stopOpacity="0" />
          </radialGradient>

          {/* Main star fill — bright icy */}
          <linearGradient id="siriusIce" x1="30%" y1="0%" x2="70%" y2="100%">
            <stop offset="0%" stopColor="#d6e5f8" stopOpacity="0.85" />
            <stop offset="35%" stopColor="#a8c8e8" stopOpacity="0.6" />
            <stop offset="70%" stopColor="#7aabcf" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#5a82a8" stopOpacity="0.25" />
          </linearGradient>

          {/* Facet overlay — inner crystalline */}
          <linearGradient id="siriusFacet" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#e0ecf8" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#7aabcf" stopOpacity="0.08" />
          </linearGradient>

          {/* Outer halo */}
          <radialGradient id="siriusHalo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#a8c8e8" stopOpacity="0" />
            <stop offset="65%" stopColor="#a8c8e8" stopOpacity="0" />
            <stop offset="82%" stopColor="#8bb0d4" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#7aabcf" stopOpacity="0" />
          </radialGradient>

          <filter id="siriusGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          <filter id="siriusSoftGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>

        <g style={styles.noWidgetStarFloat}>
          {/* Orbital rings */}
          <ellipse
            cx="100"
            cy="100"
            rx="80"
            ry="80"
            fill="none"
            stroke="#8bb0d4"
            strokeWidth="0.4"
            strokeOpacity="0.2"
            strokeDasharray="3 7"
            style={styles.noWidgetOrbitRing}
          />
          <ellipse
            cx="100"
            cy="100"
            rx="64"
            ry="64"
            fill="none"
            stroke="#a8c8e8"
            strokeWidth="0.3"
            strokeOpacity="0.14"
            strokeDasharray="2 9"
            style={styles.noWidgetOrbitRingReverse}
          />

          {/* Halo */}
          <circle cx="100" cy="100" r="90" fill="url(#siriusHalo)" />

          {/* Main star shape — single polygon, perfect symmetry */}
          <polygon
            points={STAR_POINTS}
            fill="url(#siriusIce)"
            stroke="#b8d0e8"
            strokeWidth="0.6"
            strokeOpacity="0.55"
            strokeLinejoin="round"
          />

          {/* Inner facet lines — crystalline refraction */}
          <line
            x1="100"
            y1="12"
            x2="100"
            y2="188"
            stroke="#d6e5f8"
            strokeWidth="0.4"
            strokeOpacity="0.2"
          />
          <line
            x1="12"
            y1="100"
            x2="188"
            y2="100"
            stroke="#d6e5f8"
            strokeWidth="0.4"
            strokeOpacity="0.2"
          />
          <line
            x1="56.2"
            y1="56.2"
            x2="143.8"
            y2="143.8"
            stroke="#b8d0e8"
            strokeWidth="0.3"
            strokeOpacity="0.15"
          />
          <line
            x1="143.8"
            y1="56.2"
            x2="56.2"
            y2="143.8"
            stroke="#b8d0e8"
            strokeWidth="0.3"
            strokeOpacity="0.15"
          />

          {/* Inner diamond facets */}
          <polygon
            points="100,60 130,100 100,140 70,100"
            fill="url(#siriusFacet)"
            stroke="#b8d0e8"
            strokeWidth="0.3"
            strokeOpacity="0.25"
          />
          <polygon
            points="100,75 118,100 100,125 82,100"
            fill="#d6e5f8"
            fillOpacity="0.12"
            stroke="#d6e5f8"
            strokeWidth="0.25"
            strokeOpacity="0.2"
          />

          {/* Core glow — big soft */}
          <circle
            cx="100"
            cy="100"
            r="22"
            fill="url(#siriusCoreGlow)"
            filter="url(#siriusSoftGlow)"
            style={styles.noWidgetCorePulse}
          />

          {/* Bright center */}
          <circle cx="100" cy="100" r="4" fill="#ffffff" fillOpacity="0.95" />
          <circle
            cx="100"
            cy="100"
            r="8"
            fill="#e8f2ff"
            fillOpacity="0.5"
            filter="url(#siriusGlow)"
          />

          {/* Sparkle dots */}
          <circle
            cx="34"
            cy="28"
            r="0.8"
            fill="#d6e5f8"
            fillOpacity="0.5"
            style={styles.noWidgetSparkle}
          />
          <circle
            cx="170"
            cy="42"
            r="0.6"
            fill="#e0ecf8"
            fillOpacity="0.45"
            style={styles.noWidgetSparkle2}
          />
          <circle
            cx="158"
            cy="174"
            r="0.7"
            fill="#b8d0e8"
            fillOpacity="0.4"
            style={styles.noWidgetSparkle}
          />
          <circle
            cx="38"
            cy="166"
            r="0.5"
            fill="#d6e5f8"
            fillOpacity="0.35"
            style={styles.noWidgetSparkle2}
          />
          <circle
            cx="176"
            cy="98"
            r="0.4"
            fill="#ffffff"
            fillOpacity="0.4"
            style={styles.noWidgetSparkle}
          />
          <circle
            cx="24"
            cy="108"
            r="0.5"
            fill="#e0ecf8"
            fillOpacity="0.3"
            style={styles.noWidgetSparkle2}
          />
        </g>
      </svg>
      <p style={styles.noWidgetMessage}>No active widget yet — ask your agent to test</p>
    </div>
  );
}

export default NoWidgetPlaceholder;
