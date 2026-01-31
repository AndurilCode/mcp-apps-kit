/**
 * NoWidgetPlaceholder Component
 *
 * 8-bit pixel art 8-pointed star — white on dark.
 */

import React from "react";
import { styles } from "../styles";

// 21x21 pixel grid: 8-pointed star with distinct rays.
// Each ray is 2-3px wide, clear separation between points.
const S = [
  "..........X..........",
  "..........X..........",
  ".........XXX.........",
  ".........XXX.........",
  "........XXXXX........",
  "...X...XXXXX...X....",
  "....XX.XXXXX.XX.....",
  ".....XXXXXXXXX......",
  "......XXXXXXX.......",
  "...XXXXXXXXXXXXX....",
  "XXXXXXXXXXXXXXXXXXXXX",
  "...XXXXXXXXXXXXX....",
  "......XXXXXXX.......",
  ".....XXXXXXXXX......",
  "....XX.XXXXX.XX.....",
  "...X...XXXXX...X....",
  "........XXXXX........",
  ".........XXX.........",
  ".........XXX.........",
  "..........X..........",
  "..........X..........",
];

const PX = 6;
const GRID_W = 21;
const GRID_H = 21;

export function NoWidgetPlaceholder(): React.ReactElement {
  const pixels: React.ReactElement[] = [];

  for (let row = 0; row < S.length; row++) {
    for (let col = 0; col < S[row].length; col++) {
      if (S[row][col] === "X") {
        pixels.push(
          <rect
            key={`${row}-${col}`}
            x={col * PX}
            y={row * PX}
            width={PX}
            height={PX}
            fill="#ffffff"
          />
        );
      }
    }
  }

  const w = GRID_W * PX;
  const h = GRID_H * PX;

  return (
    <div style={styles.noWidgetWrapper}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        role="img"
        aria-label="Sirius the star"
        style={styles.noWidgetStar}
        shapeRendering="crispEdges"
      >
        <g style={styles.noWidgetStarFloat}>{pixels}</g>
      </svg>
      <p style={styles.noWidgetMessage}>No active widget yet — ask your agent to test</p>
    </div>
  );
}

export default NoWidgetPlaceholder;
