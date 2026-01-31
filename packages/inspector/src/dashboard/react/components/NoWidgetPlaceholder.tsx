/**
 * NoWidgetPlaceholder Component
 *
 * Crystalline star image with floating animation.
 */

import React from "react";
import { styles } from "../styles";
import starUrl from "../../assets/sirius-star.png";

export function NoWidgetPlaceholder(): React.ReactElement {
  return (
    <div style={styles.noWidgetWrapper}>
      <img
        src={starUrl}
        alt="Sirius the star"
        width={180}
        height={180}
        style={styles.noWidgetStar}
      />
      <p style={styles.noWidgetMessage}>No active widget yet — ask your agent to test</p>
    </div>
  );
}

export default NoWidgetPlaceholder;
