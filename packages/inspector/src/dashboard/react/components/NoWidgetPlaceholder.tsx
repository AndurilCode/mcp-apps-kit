/**
 * NoWidgetPlaceholder Component
 *
 * Animated crystalline star placeholder for empty screencast state.
 * Based on the Sirius avatar — an elegant 8-pointed star with
 * glass-like facets, glowing center, and subtle orbital rings.
 */

import React from "react";
import { styles } from "../styles";

export function NoWidgetPlaceholder(): React.ReactElement {
  return (
    <div style={styles.noWidgetWrapper}>
      <svg
        viewBox="0 0 200 200"
        width="160"
        height="160"
        role="img"
        aria-label="Sirius the star"
        style={styles.noWidgetStar}
      >
        <defs>
          {/* Core glow gradient */}
          <radialGradient id="siriusCoreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="30%" stopColor="#b8e8f0" stopOpacity="0.9" />
            <stop offset="60%" stopColor="#4db8b0" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#20b2aa" stopOpacity="0" />
          </radialGradient>

          {/* Crystalline facet gradient — main points */}
          <linearGradient id="siriusFacetA" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#b8e8f0" stopOpacity="0.7" />
            <stop offset="40%" stopColor="#5cc8c0" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#1a6e6a" stopOpacity="0.15" />
          </linearGradient>

          {/* Crystalline facet gradient — diagonal points */}
          <linearGradient id="siriusFacetB" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#a0dce0" stopOpacity="0.5" />
            <stop offset="50%" stopColor="#3aada6" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#145550" stopOpacity="0.1" />
          </linearGradient>

          {/* Outer halo */}
          <radialGradient id="siriusHalo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#20b2aa" stopOpacity="0" />
            <stop offset="70%" stopColor="#20b2aa" stopOpacity="0" />
            <stop offset="85%" stopColor="#20b2aa" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#20b2aa" stopOpacity="0" />
          </radialGradient>

          {/* Glow filter */}
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
          {/* Orbital ring — subtle binary/digital feel */}
          <ellipse
            cx="100"
            cy="100"
            rx="72"
            ry="72"
            fill="none"
            stroke="#20b2aa"
            strokeWidth="0.3"
            strokeOpacity="0.15"
            strokeDasharray="3 6"
            style={styles.noWidgetOrbitRing}
          />
          <ellipse
            cx="100"
            cy="100"
            rx="56"
            ry="56"
            fill="none"
            stroke="#20b2aa"
            strokeWidth="0.3"
            strokeOpacity="0.1"
            strokeDasharray="2 8"
            style={styles.noWidgetOrbitRingReverse}
          />

          {/* Halo */}
          <circle cx="100" cy="100" r="80" fill="url(#siriusHalo)" />

          {/* 8-pointed star — four main cardinal points */}
          <polygon
            points="100,18 106,80 100,88 94,80"
            fill="url(#siriusFacetA)"
            stroke="#80d8d2"
            strokeWidth="0.5"
            strokeOpacity="0.4"
          />
          <polygon
            points="182,100 120,106 112,100 120,94"
            fill="url(#siriusFacetA)"
            stroke="#80d8d2"
            strokeWidth="0.5"
            strokeOpacity="0.4"
          />
          <polygon
            points="100,182 94,120 100,112 106,120"
            fill="url(#siriusFacetA)"
            stroke="#80d8d2"
            strokeWidth="0.5"
            strokeOpacity="0.4"
          />
          <polygon
            points="18,100 80,94 88,100 80,106"
            fill="url(#siriusFacetA)"
            stroke="#80d8d2"
            strokeWidth="0.5"
            strokeOpacity="0.4"
          />

          {/* Diagonal points — slightly shorter */}
          <polygon
            points="158,42 114,86 108,88 112,82"
            fill="url(#siriusFacetB)"
            stroke="#60c0b8"
            strokeWidth="0.4"
            strokeOpacity="0.3"
          />
          <polygon
            points="158,158 114,114 112,108 118,112"
            fill="url(#siriusFacetB)"
            stroke="#60c0b8"
            strokeWidth="0.4"
            strokeOpacity="0.3"
          />
          <polygon
            points="42,158 86,114 88,108 82,112"
            fill="url(#siriusFacetB)"
            stroke="#60c0b8"
            strokeWidth="0.4"
            strokeOpacity="0.3"
          />
          <polygon
            points="42,42 86,86 88,92 82,88"
            fill="url(#siriusFacetB)"
            stroke="#60c0b8"
            strokeWidth="0.4"
            strokeOpacity="0.3"
          />

          {/* Inner crystalline facets — refractions */}
          <polygon
            points="100,70 108,92 100,96 92,92"
            fill="#b8e8f0"
            fillOpacity="0.15"
            stroke="#a0dce0"
            strokeWidth="0.3"
            strokeOpacity="0.3"
          />
          <polygon
            points="130,100 108,108 104,100 108,92"
            fill="#b8e8f0"
            fillOpacity="0.12"
            stroke="#a0dce0"
            strokeWidth="0.3"
            strokeOpacity="0.25"
          />
          <polygon
            points="100,130 92,108 96,104 108,108"
            fill="#b8e8f0"
            fillOpacity="0.1"
            stroke="#a0dce0"
            strokeWidth="0.3"
            strokeOpacity="0.2"
          />
          <polygon
            points="70,100 92,92 96,96 92,108"
            fill="#b8e8f0"
            fillOpacity="0.08"
            stroke="#a0dce0"
            strokeWidth="0.3"
            strokeOpacity="0.2"
          />

          {/* Core glow — soft radial */}
          <circle
            cx="100"
            cy="100"
            r="16"
            fill="url(#siriusCoreGlow)"
            filter="url(#siriusSoftGlow)"
            style={styles.noWidgetCorePulse}
          />

          {/* Bright center point */}
          <circle cx="100" cy="100" r="3" fill="#ffffff" fillOpacity="0.95" />
          <circle
            cx="100"
            cy="100"
            r="6"
            fill="#e0f4f4"
            fillOpacity="0.4"
            filter="url(#siriusGlow)"
          />

          {/* Tiny star dots — ambient sparkle */}
          <circle
            cx="38"
            cy="34"
            r="0.8"
            fill="#b8e8f0"
            fillOpacity="0.5"
            style={styles.noWidgetSparkle}
          />
          <circle
            cx="164"
            cy="48"
            r="0.6"
            fill="#b8e8f0"
            fillOpacity="0.4"
            style={styles.noWidgetSparkle2}
          />
          <circle
            cx="152"
            cy="168"
            r="0.7"
            fill="#b8e8f0"
            fillOpacity="0.35"
            style={styles.noWidgetSparkle}
          />
          <circle
            cx="44"
            cy="160"
            r="0.5"
            fill="#b8e8f0"
            fillOpacity="0.3"
            style={styles.noWidgetSparkle2}
          />
          <circle
            cx="170"
            cy="94"
            r="0.4"
            fill="#ffffff"
            fillOpacity="0.3"
            style={styles.noWidgetSparkle}
          />
          <circle
            cx="30"
            cy="110"
            r="0.5"
            fill="#ffffff"
            fillOpacity="0.25"
            style={styles.noWidgetSparkle2}
          />
        </g>
      </svg>
      <p style={styles.noWidgetMessage}>No active widget yet — ask your agent to test</p>
    </div>
  );
}

export default NoWidgetPlaceholder;
