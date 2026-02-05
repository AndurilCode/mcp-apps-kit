/**
 * TASK-013 — Visual Polish (Colors, Typography & Scrollbars)
 *
 * Tests that verify CSS-in-JS style values match the design spec.
 * All acceptance criteria are covered by assertions against the
 * exported style objects and source file contents.
 */

import { describe, it, expect } from "vitest";
import { styles } from "../src/dashboard/react/styles";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEAL_HEX = "#20b2aa";
const TEAL_RGBA_PREFIX = "rgba(32, 178, 170,"; // old rgba prefix
const WHITE_HEX = "#ffffff";

/** Read a source file relative to the inspector package root */
function readSource(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "..", relPath), "utf-8");
}

// ==========================================================================
// AC-1: All #20b2aa text/border colors replaced with #ffffff
//        (statusDotConnected + statusDotStreaming backgrounds preserved)
// ==========================================================================

describe("AC-1: Teal-to-white color replacement", () => {
  // ---- styles.ts replacements ----

  it("toolbarBtnActive uses white color, border, and shadow", () => {
    expect(styles.toolbarBtnActive.color).toBe(WHITE_HEX);
    expect(styles.toolbarBtnActive.borderColor).toBe(WHITE_HEX);
    expect(styles.toolbarBtnActive.boxShadow).toContain("rgba(255, 255, 255,");
    expect(styles.toolbarBtnActive.boxShadow).not.toContain(TEAL_RGBA_PREFIX);
  });

  it("globalsCollapsedToggle uses white border and color", () => {
    expect(styles.globalsCollapsedToggle.border).toContain(WHITE_HEX);
    expect(styles.globalsCollapsedToggle.color).toBe(WHITE_HEX);
  });

  it("placeholderIcon uses white color", () => {
    expect(styles.placeholderIcon.color).toBe(WHITE_HEX);
  });

  it("globalsSectionTitle uses white color", () => {
    expect(styles.globalsSectionTitle.color).toBe(WHITE_HEX);
  });

  it("viewModeBtnActive uses white color and border", () => {
    expect(styles.viewModeBtnActive.color).toBe(WHITE_HEX);
    expect(styles.viewModeBtnActive.borderColor).toBe(WHITE_HEX);
  });

  it("rightPanelTabActive uses white color and border", () => {
    expect(styles.rightPanelTabActive.color).toBe(WHITE_HEX);
    expect(styles.rightPanelTabActive.borderColor).toBe(WHITE_HEX);
  });

  // ---- Preserved teal for status dots (exception) ----

  it("statusDotConnected preserves teal background", () => {
    expect(styles.statusDotConnected.backgroundColor).toBe(TEAL_HEX);
  });

  it("statusDotStreaming preserves teal background and shadow", () => {
    expect(styles.statusDotStreaming.backgroundColor).toBe(TEAL_HEX);
    expect(styles.statusDotStreaming.boxShadow).toContain("rgba(32, 178, 170,");
  });

  // ---- Exhaustive check: no stray #20b2aa in styles.ts (except status dots) ----

  it("styles.ts has no #20b2aa outside statusDot entries", () => {
    const src = readSource("src/dashboard/react/styles.ts");
    // Find all occurrences
    const regex = /#20b2aa/gi;
    const matches: { index: number; context: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(src)) !== null) {
      const lineStart = src.lastIndexOf("\n", m.index) + 1;
      const lineEnd = src.indexOf("\n", m.index);
      matches.push({
        index: m.index,
        context: src.slice(lineStart, lineEnd).trim(),
      });
    }
    // Only allowed inside statusDotConnected and statusDotStreaming
    for (const match of matches) {
      const isStatusDot =
        match.context.includes("statusDot") ||
        // The actual values are inside the statusDot* entries
        /backgroundColor.*#20b2aa/.test(match.context) ||
        /boxShadow.*rgba\(32,\s*178,\s*170/.test(match.context);
      expect(isStatusDot).toBe(true);
    }
  });
});

// ==========================================================================
// AC-2: All rgba(32,178,170,...) backgrounds/shadows → rgba(255,255,255,...)
// ==========================================================================

describe("AC-2: rgba teal-to-white replacement at identical opacities", () => {
  it("viewModeBtnActive background uses rgba(255,255,255,0.15)", () => {
    expect(styles.viewModeBtnActive.backgroundColor).toBe("rgba(255, 255, 255, 0.15)");
  });

  it("rightPanelTabActive background uses rgba(255,255,255,0.15)", () => {
    expect(styles.rightPanelTabActive.backgroundColor).toBe("rgba(255, 255, 255, 0.15)");
  });

  it("rightPanelTabCountActive uses rgba(255,255,255,0.2)", () => {
    expect(styles.rightPanelTabCountActive.backgroundColor).toBe("rgba(255, 255, 255, 0.2)");
  });

  it("statusWrapperStreaming boxShadow uses rgba(255,255,255,...)", () => {
    const shadow = styles.statusWrapperStreaming.boxShadow as string;
    expect(shadow).toContain("rgba(255, 255, 255, 0.4)");
    expect(shadow).toContain("rgba(255, 255, 255, 0.2)");
    expect(shadow).not.toContain("rgba(32, 178, 170,");
  });

  it("styles.ts has no rgba(32,178,170 outside statusDot entries", () => {
    const src = readSource("src/dashboard/react/styles.ts");
    const regex = /rgba\(32,\s*178,\s*170/g;
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(src)) !== null) {
      const lineStart = src.lastIndexOf("\n", m.index) + 1;
      const lineEnd = src.indexOf("\n", m.index);
      matches.push(src.slice(lineStart, lineEnd).trim());
    }
    // Only occurrence allowed is in statusDotStreaming boxShadow
    for (const line of matches) {
      expect(line).toMatch(/statusDot|boxShadow.*rgba\(32,\s*178,\s*170/);
    }
  });
});

// ==========================================================================
// AC-3: McpPrimitivesPanel — schemaType #c4b5fd, schemaName #ffffff,
//        cardName sans-serif (FONT_SANS)
// ==========================================================================

describe("AC-3: McpPrimitivesPanel typography and colors", () => {
  // We read the source and check the localStyles object values
  const panelSrc = readSource("src/dashboard/react/components/McpPrimitivesPanel.tsx");

  it("schemaType color is #c4b5fd (purple)", () => {
    // localStyles.schemaType.color should be '#c4b5fd'
    expect(panelSrc).toContain('color: "#c4b5fd"');
  });

  it("schemaName color is #ffffff", () => {
    // The schemaName entry should have color: "#ffffff"
    expect(panelSrc).toContain('color: "#ffffff"');
    // Specifically within the schemaName style block
    const schemaNameBlock = panelSrc.slice(
      panelSrc.indexOf("schemaName:"),
      panelSrc.indexOf("schemaType:")
    );
    expect(schemaNameBlock).toContain('color: "#ffffff"');
  });

  it("cardName uses FONT_SANS (sans-serif stack), not monospace", () => {
    // Find the cardName block
    const cardNameStart = panelSrc.indexOf("cardName:");
    const cardNameEnd = panelSrc.indexOf("},", cardNameStart);
    const cardNameBlock = panelSrc.slice(cardNameStart, cardNameEnd);
    expect(cardNameBlock).toContain("FONT_SANS");
    expect(cardNameBlock).not.toContain("monospace");
    expect(cardNameBlock).not.toContain("JetBrains");
  });

  it("FONT_SANS constant is defined with Inter as primary font", () => {
    expect(panelSrc).toContain("const FONT_SANS =");
    expect(panelSrc).toContain("'Inter'");
  });

  it("no #20b2aa in McpPrimitivesPanel.tsx", () => {
    expect(panelSrc).not.toContain(TEAL_HEX);
  });

  it("no rgba(32,178,170 in McpPrimitivesPanel.tsx", () => {
    expect(panelSrc).not.toMatch(/rgba\(32,\s*178,\s*170/);
  });
});

// ==========================================================================
// AC-4: styles.ts — reasoningContainer.padding & reasoningText.fontFamily
// ==========================================================================

describe("AC-4: Reasoning container and text styles", () => {
  it("reasoningContainer padding is '0.25rem 0.5rem'", () => {
    expect(styles.reasoningContainer.padding).toBe("0.25rem 0.5rem");
  });

  it("reasoningText fontFamily includes FONT_SANS (Inter)", () => {
    const ff = styles.reasoningText.fontFamily as string;
    expect(ff).toContain("Inter");
    expect(ff).toContain("sans-serif");
    // Should NOT be monospace
    expect(ff).not.toContain("monospace");
    expect(ff).not.toContain("JetBrains");
  });
});

// ==========================================================================
// AC-5: All resize handles — 2px visible line centered in 6px hit area
// ==========================================================================

describe("AC-5: Resize handles — 2px line in 6px hit area via gradient", () => {
  // Horizontal resize (ns-resize) — styles.ts
  it("resizeHandle (horizontal) is 6px tall with centered gradient", () => {
    expect(styles.resizeHandle.height).toBe("6px");
    expect(styles.resizeHandle.cursor).toBe("ns-resize");
    const bg = styles.resizeHandle.background as string;
    // Pattern: transparent 2px, color 2px, color 4px, transparent 4px
    expect(bg).toContain("linear-gradient(to bottom");
    expect(bg).toContain("transparent 2px");
    expect(bg).toContain("#2d2f2f 2px");
    expect(bg).toContain("#2d2f2f 4px");
    expect(bg).toContain("transparent 4px");
  });

  it("resizeHandleActive (horizontal) highlights with white", () => {
    const bg = styles.resizeHandleActive.background as string;
    expect(bg).toContain("linear-gradient(to bottom");
    expect(bg).toContain(WHITE_HEX);
    expect(bg).not.toContain(TEAL_HEX);
  });

  // Vertical resize (ew-resize) — styles.ts rightPanelResizeHandle
  it("rightPanelResizeHandle is 6px wide with centered gradient", () => {
    expect(styles.rightPanelResizeHandle.width).toBe("6px");
    expect(styles.rightPanelResizeHandle.cursor).toBe("ew-resize");
    const bg = styles.rightPanelResizeHandle.background as string;
    expect(bg).toContain("linear-gradient(to right");
    expect(bg).toContain("transparent 2px");
    expect(bg).toContain("#2d2f2f 2px");
    expect(bg).toContain("#2d2f2f 4px");
    expect(bg).toContain("transparent 4px");
  });

  it("rightPanelResizeHandleActive highlights with white", () => {
    const bg = styles.rightPanelResizeHandleActive.background as string;
    expect(bg).toContain("linear-gradient(to right");
    expect(bg).toContain(WHITE_HEX);
    expect(bg).not.toContain(TEAL_HEX);
  });

  // McpPrimitivesPanel resize handle
  it("McpPrimitivesPanel localStyles resize handle uses gradient pattern", () => {
    const src = readSource("src/dashboard/react/components/McpPrimitivesPanel.tsx");
    // Find the resizeHandle block in localStyles
    const rhStart = src.indexOf("resizeHandle:", src.indexOf("localStyles"));
    const rhEnd = src.indexOf("},", rhStart);
    const rhBlock = src.slice(rhStart, rhEnd);

    expect(rhBlock).toContain('width: "6px"');
    expect(rhBlock).toContain("linear-gradient(to right");
    expect(rhBlock).toContain("transparent 2px");
    expect(rhBlock).not.toContain("backgroundColor");
  });

  it("McpPrimitivesPanel resizeHandleActive uses white gradient", () => {
    const src = readSource("src/dashboard/react/components/McpPrimitivesPanel.tsx");
    const rhaStart = src.indexOf("resizeHandleActive:", src.indexOf("localStyles"));
    const rhaEnd = src.indexOf("},", rhaStart);
    const rhaBlock = src.slice(rhaStart, rhaEnd);

    expect(rhaBlock).toContain("linear-gradient(to right");
    expect(rhaBlock).toContain(WHITE_HEX);
    expect(rhaBlock).not.toContain(TEAL_HEX);
  });
});

// ==========================================================================
// AC-6: keyframes.css — ::-webkit-scrollbar rules
// ==========================================================================

describe("AC-6: Custom scrollbar rules in keyframes.css", () => {
  const css = readSource("src/dashboard/react/keyframes.css");

  it("defines ::-webkit-scrollbar with 8px width", () => {
    expect(css).toContain("::-webkit-scrollbar");
    expect(css).toMatch(/::-webkit-scrollbar\s*\{[^}]*width:\s*8px/);
  });

  it("defines ::-webkit-scrollbar-track with transparent background", () => {
    expect(css).toContain("::-webkit-scrollbar-track");
    expect(css).toMatch(/::-webkit-scrollbar-track\s*\{[^}]*background:\s*transparent/);
  });

  it("defines ::-webkit-scrollbar-thumb with dark semi-transparent background", () => {
    expect(css).toContain("::-webkit-scrollbar-thumb");
    // rgba(255, 255, 255, 0.15) — dark (low-opacity white)
    expect(css).toMatch(
      /::-webkit-scrollbar-thumb\s*\{[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.15\)/
    );
  });

  it("defines ::-webkit-scrollbar-thumb:hover with brighter background", () => {
    expect(css).toContain("::-webkit-scrollbar-thumb:hover");
    expect(css).toMatch(
      /::-webkit-scrollbar-thumb:hover\s*\{[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.25\)/
    );
  });

  it("thumb has border-radius for rounded appearance", () => {
    expect(css).toMatch(/::-webkit-scrollbar-thumb\s*\{[^}]*border-radius:\s*4px/);
  });
});

// ==========================================================================
// AC-7: Required indicator — '*' instead of 'req', color #ef9a9a,
//        fontSize 0.75rem, no textTransform
// ==========================================================================

describe("AC-7: Required indicator in McpPrimitivesPanel", () => {
  const src = readSource("src/dashboard/react/components/McpPrimitivesPanel.tsx");

  it("renders '*' instead of 'req' for required params", () => {
    // The SchemaProperties component should render '*'
    expect(src).toContain(">*</span>");
    expect(src).not.toContain(">req</span>");
  });

  it("schemaRequired style has color #ef9a9a", () => {
    const srStart = src.indexOf("schemaRequired:");
    const srEnd = src.indexOf("},", srStart);
    const srBlock = src.slice(srStart, srEnd);
    expect(srBlock).toContain('color: "#ef9a9a"');
  });

  it("schemaRequired style has fontSize 0.75rem", () => {
    const srStart = src.indexOf("schemaRequired:");
    const srEnd = src.indexOf("},", srStart);
    const srBlock = src.slice(srStart, srEnd);
    expect(srBlock).toContain('fontSize: "0.75rem"');
  });

  it("schemaRequired style has no textTransform", () => {
    const srStart = src.indexOf("schemaRequired:");
    const srEnd = src.indexOf("},", srStart);
    const srBlock = src.slice(srStart, srEnd);
    expect(srBlock).not.toContain("textTransform");
  });
});

// ==========================================================================
// AC-8: statusWrapperStreaming gradient uses #ffffff instead of #20b2aa
// ==========================================================================

describe("AC-8: statusWrapperStreaming gradient uses white", () => {
  it("background gradient contains #ffffff", () => {
    const bg = styles.statusWrapperStreaming.background as string;
    expect(bg).toContain(WHITE_HEX);
    expect(bg).not.toContain(TEAL_HEX);
  });

  it("background is a linear-gradient with white stops", () => {
    const bg = styles.statusWrapperStreaming.background as string;
    expect(bg).toMatch(/linear-gradient\(90deg,\s*#ffffff/);
    expect(bg).toContain("rgba(255, 255, 255, 0.5)");
  });

  it("boxShadow uses white rgba, not teal", () => {
    const shadow = styles.statusWrapperStreaming.boxShadow as string;
    expect(shadow).toContain("rgba(255, 255, 255,");
    expect(shadow).not.toContain("rgba(32, 178, 170,");
  });
});

// ==========================================================================
// ConnectionBar.tsx — no teal remnants
// ==========================================================================

describe("ConnectionBar: teal replacements", () => {
  const src = readSource("src/dashboard/react/components/ConnectionBar.tsx");

  it("has no #20b2aa anywhere in file", () => {
    expect(src).not.toContain(TEAL_HEX);
  });

  it("has no rgba(32,178,170 anywhere in file", () => {
    expect(src).not.toMatch(/rgba\(32,\s*178,\s*170/);
  });

  it("inputWrapperFocused uses white border and shadow", () => {
    // borderColor: "#ffffff"
    expect(src).toContain('borderColor: "#ffffff"');
    // boxShadow with white rgba
    expect(src).toContain("rgba(255, 255, 255, 0.2)");
  });

  it("connectButton uses white color", () => {
    // In connectionBarStyles.connectButton
    const cbStart = src.indexOf("connectButton:");
    const cbEnd = src.indexOf("},", cbStart);
    const block = src.slice(cbStart, cbEnd);
    expect(block).toContain('color: "#ffffff"');
  });

  it("settingsButtonActive uses white color and rgba", () => {
    const sbStart = src.indexOf("settingsButtonActive:");
    const sbEnd = src.indexOf("},", sbStart);
    const block = src.slice(sbStart, sbEnd);
    expect(block).toContain('color: "#ffffff"');
    expect(block).toContain("rgba(255, 255, 255, 0.1)");
  });

  it("oauthButtonAuthenticated uses white color", () => {
    const oStart = src.indexOf("oauthButtonAuthenticated:");
    const oEnd = src.indexOf("},", oStart);
    const block = src.slice(oStart, oEnd);
    expect(block).toContain('color: "#ffffff"');
  });

  it("badgeChatgptApps uses white color and rgba background", () => {
    const bStart = src.indexOf("badgeChatgptApps:");
    const bEnd = src.indexOf("},", bStart);
    const block = src.slice(bStart, bEnd);
    expect(block).toContain('color: "#ffffff"');
    expect(block).toContain("rgba(255, 255, 255, 0.15)");
  });

  it("loadingSpinner borderTopColor is white", () => {
    const lsStart = src.indexOf("loadingSpinner:");
    const lsEnd = src.indexOf("},", lsStart);
    const block = src.slice(lsStart, lsEnd);
    expect(block).toContain('borderTopColor: "#ffffff"');
  });
});

// ==========================================================================
// Toolbar.tsx — OAuth button teal replacement
// ==========================================================================

describe("Toolbar: OAuth button teal replacement", () => {
  const src = readSource("src/dashboard/react/components/Toolbar.tsx");

  it("has no #20b2aa anywhere in file", () => {
    expect(src).not.toContain(TEAL_HEX);
  });

  it("has no rgba(32,178,170 anywhere in file", () => {
    expect(src).not.toMatch(/rgba\(32,\s*178,\s*170/);
  });

  it("authenticated OAuth button uses white color", () => {
    const authStart = src.indexOf("authenticated:");
    const authEnd = src.indexOf("},", authStart);
    const block = src.slice(authStart, authEnd);
    expect(block).toContain('color: "#ffffff"');
    expect(block).toContain("rgba(255, 255, 255, 0.15)");
    expect(block).toContain("rgba(255, 255, 255, 0.3)");
  });
});
