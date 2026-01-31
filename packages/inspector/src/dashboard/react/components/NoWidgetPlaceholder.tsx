/**
 * NoWidgetPlaceholder Component
 *
 * 8-bit pixel art star placeholder — white on dark.
 */

import React from "react";
import { styles } from "../styles";

// 15x15 pixel grid representing an 8-pointed star.
// 1 = filled pixel, 0 = empty.
const STAR_GRID = [
  [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0],
  [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
  [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
  [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
];

const PIXEL_SIZE = 8;

export function NoWidgetPlaceholder(): React.ReactElement {
  const pixels: React.ReactElement[] = [];

  for (let row = 0; row < STAR_GRID.length; row++) {
    for (let col = 0; col < STAR_GRID[row].length; col++) {
      if (STAR_GRID[row][col] === 1) {
        pixels.push(
          <rect
            key={`${row}-${col}`}
            x={col * PIXEL_SIZE}
            y={row * PIXEL_SIZE}
            width={PIXEL_SIZE}
            height={PIXEL_SIZE}
            fill="#ffffff"
          />
        );
      }
    }
  }

  const gridW = 15 * PIXEL_SIZE;
  const gridH = 15 * PIXEL_SIZE;

  return (
    <div style={styles.noWidgetWrapper}>
      <svg
        viewBox={`0 0 ${gridW} ${gridH}`}
        width={gridW}
        height={gridH}
        role="img"
        aria-label="Sirius the star"
        style={styles.noWidgetStar}
      >
        <g style={styles.noWidgetStarFloat}>{pixels}</g>
      </svg>
      <p style={styles.noWidgetMessage}>No active widget yet — ask your agent to test</p>
    </div>
  );
}

export default NoWidgetPlaceholder;
