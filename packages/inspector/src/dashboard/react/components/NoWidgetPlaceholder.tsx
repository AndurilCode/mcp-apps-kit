/**
 * NoWidgetPlaceholder Component
 *
 * Animated crystalline star placeholder for empty screencast state.
 * Icy blue 8-pointed star with glass facets, glowing center, orbital rings.
 */

import React from "react";
import { styles } from "../styles";

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
          {/* Core glow — icy white to blue */}
          <radialGradient id="siriusCoreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="25%" stopColor="#d6e5f8" stopOpacity="0.9" />
            <stop offset="55%" stopColor="#8bb0d4" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#5a82a8" stopOpacity="0" />
          </radialGradient>

          {/* Main facets — light steel blue */}
          <linearGradient id="siriusFacetA" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#b8d0e8" stopOpacity="0.8" />
            <stop offset="40%" stopColor="#7aabcf" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#4a6e8e" stopOpacity="0.2" />
          </linearGradient>

          {/* Diagonal facets — softer */}
          <linearGradient id="siriusFacetB" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#a8c8e8" stopOpacity="0.6" />
            <stop offset="50%" stopColor="#6b98be" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#3d6080" stopOpacity="0.12" />
          </linearGradient>

          {/* Outer halo */}
          <radialGradient id="siriusHalo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#7aabcf" stopOpacity="0" />
            <stop offset="70%" stopColor="#7aabcf" stopOpacity="0" />
            <stop offset="85%" stopColor="#7aabcf" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#7aabcf" stopOpacity="0" />
          </radialGradient>

          {/* Glow filters */}
          <filter id="siriusGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          <filter id="siriusSoftGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
        </defs>

        {/* Animated group */}
        <g style={styles.noWidgetStarFloat}>
          {/* Orbital rings */}
          <ellipse
            cx="100"
            cy="100"
            rx="78"
            ry="78"
            fill="none"
            stroke="#7aabcf"
            strokeWidth="0.4"
            strokeOpacity="0.18"
            strokeDasharray="3 6"
            style={styles.noWidgetOrbitRing}
          />
          <ellipse
            cx="100"
            cy="100"
            rx="62"
            ry="62"
            fill="none"
            stroke="#8bb0d4"
            strokeWidth="0.3"
            strokeOpacity="0.12"
            strokeDasharray="2 8"
            style={styles.noWidgetOrbitRingReverse}
          />

          {/* Halo */}
          <circle cx="100" cy="100" r="85" fill="url(#siriusHalo)" />

          {/* Cardinal points — broad compass-style */}
          <polygon
            points="100,12 118,74 100,90 82,74"
            fill="url(#siriusFacetA)"
            stroke="#a8c8e8"
            strokeWidth="0.5"
            strokeOpacity="0.5"
          />
          <polygon
            points="188,100 126,118 110,100 126,82"
            fill="url(#siriusFacetA)"
            stroke="#a8c8e8"
            strokeWidth="0.5"
            strokeOpacity="0.5"
          />
          <polygon
            points="100,188 82,126 100,110 118,126"
            fill="url(#siriusFacetA)"
            stroke="#a8c8e8"
            strokeWidth="0.5"
            strokeOpacity="0.5"
          />
          <polygon
            points="12,100 74,82 90,100 74,118"
            fill="url(#siriusFacetA)"
            stroke="#a8c8e8"
            strokeWidth="0.5"
            strokeOpacity="0.5"
          />

          {/* Diagonal points — broad, slightly shorter */}
          <polygon
            points="162,38 118,82 100,92 112,72"
            fill="url(#siriusFacetB)"
            stroke="#8bb0d4"
            strokeWidth="0.4"
            strokeOpacity="0.35"
          />
          <polygon
            points="162,162 118,118 108,100 128,112"
            fill="url(#siriusFacetB)"
            stroke="#8bb0d4"
            strokeWidth="0.4"
            strokeOpacity="0.35"
          />
          <polygon
            points="38,162 82,118 92,100 72,128"
            fill="url(#siriusFacetB)"
            stroke="#8bb0d4"
            strokeWidth="0.4"
            strokeOpacity="0.35"
          />
          <polygon
            points="38,38 82,82 92,100 72,88"
            fill="url(#siriusFacetB)"
            stroke="#8bb0d4"
            strokeWidth="0.4"
            strokeOpacity="0.35"
          />

          {/* Inner crystalline facets */}
          <polygon
            points="100,64 114,88 100,98 86,88"
            fill="#b8d0e8"
            fillOpacity="0.2"
            stroke="#a8c8e8"
            strokeWidth="0.3"
            strokeOpacity="0.35"
          />
          <polygon
            points="136,100 112,114 102,100 112,86"
            fill="#b8d0e8"
            fillOpacity="0.16"
            stroke="#a8c8e8"
            strokeWidth="0.3"
            strokeOpacity="0.3"
          />
          <polygon
            points="100,136 86,112 98,102 114,112"
            fill="#b8d0e8"
            fillOpacity="0.13"
            stroke="#a8c8e8"
            strokeWidth="0.3"
            strokeOpacity="0.25"
          />
          <polygon
            points="64,100 88,86 98,98 88,114"
            fill="#b8d0e8"
            fillOpacity="0.1"
            stroke="#a8c8e8"
            strokeWidth="0.3"
            strokeOpacity="0.22"
          />

          {/* Core glow */}
          <circle
            cx="100"
            cy="100"
            r="18"
            fill="url(#siriusCoreGlow)"
            filter="url(#siriusSoftGlow)"
            style={styles.noWidgetCorePulse}
          />

          {/* Bright center */}
          <circle cx="100" cy="100" r="3.5" fill="#ffffff" fillOpacity="0.95" />
          <circle
            cx="100"
            cy="100"
            r="7"
            fill="#e0ecf8"
            fillOpacity="0.45"
            filter="url(#siriusGlow)"
          />

          {/* Ambient sparkles */}
          <circle
            cx="36"
            cy="30"
            r="0.9"
            fill="#b8d0e8"
            fillOpacity="0.5"
            style={styles.noWidgetSparkle}
          />
          <circle
            cx="168"
            cy="44"
            r="0.7"
            fill="#d6e5f8"
            fillOpacity="0.45"
            style={styles.noWidgetSparkle2}
          />
          <circle
            cx="156"
            cy="172"
            r="0.8"
            fill="#a8c8e8"
            fillOpacity="0.4"
            style={styles.noWidgetSparkle}
          />
          <circle
            cx="40"
            cy="164"
            r="0.6"
            fill="#b8d0e8"
            fillOpacity="0.35"
            style={styles.noWidgetSparkle2}
          />
          <circle
            cx="174"
            cy="96"
            r="0.5"
            fill="#ffffff"
            fillOpacity="0.35"
            style={styles.noWidgetSparkle}
          />
          <circle
            cx="26"
            cy="112"
            r="0.6"
            fill="#d6e5f8"
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
