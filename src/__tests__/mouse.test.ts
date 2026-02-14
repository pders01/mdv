/**
 * Mouse input handling tests
 *
 * Tests the pure mouseYToLine conversion (uniform fallback and position-based
 * refinement) and click-to-position cursor interactions.
 *
 * Character-level drag selection is handled natively by OpenTUI's renderer
 * and is not tested here.
 */

import { describe, test, expect } from "bun:test";
import { uniformMouseYToLine, mouseYToLine } from "../input/mouse.js";
import { createCursorManager, type CursorManager } from "../input/cursor.js";
import type { LinePosition, GetLinePosition } from "../ui/container.js";

// ---------------------------------------------------------------------------
// Helper: build a mock getLinePosition from a layout description
// ---------------------------------------------------------------------------

/**
 * Create a getLinePosition function from an array of { y, height } entries.
 * Index = line number.  null entries simulate unmapped lines (gaps).
 */
function makeGetLinePos(positions: (LinePosition | null)[]): GetLinePosition {
  return (line: number) => {
    if (line < 0 || line >= positions.length) return null;
    return positions[line];
  };
}

/**
 * Build positions where every line is 1 row tall, packed contiguously.
 * This simulates a simple document (e.g. a single code block).
 */
function uniformPositions(totalLines: number, startY: number = 0): LinePosition[] {
  return Array.from({ length: totalLines }, (_, i) => ({ y: startY + i, height: 1 }));
}

/**
 * Build positions that mimic a realistic markdown document:
 *   - Headers take 2 rows (text + bottom margin)
 *   - Paragraphs: 1 row per line + 1 row gap after
 *   - Code blocks: 1 row padding top, 1 row per line, 1 row padding bottom
 * Returns viewport-relative positions (already accounting for scroll).
 */
function realisticPositions(
  spec: Array<{ type: "header" | "paragraph" | "code"; lines: number }>,
): LinePosition[] {
  const positions: LinePosition[] = [];
  let y = 0;

  for (const block of spec) {
    switch (block.type) {
      case "header":
        // Header line takes 1 row, then 1 row margin
        for (let i = 0; i < block.lines; i++) {
          positions.push({ y, height: 1 });
          y += 1;
        }
        y += 1; // margin after header
        break;
      case "paragraph":
        for (let i = 0; i < block.lines; i++) {
          positions.push({ y, height: 1 });
          y += 1;
        }
        y += 1; // margin after paragraph
        break;
      case "code":
        y += 1; // padding top
        for (let i = 0; i < block.lines; i++) {
          positions.push({ y, height: 1 });
          y += 1;
        }
        y += 1; // padding bottom
        break;
    }
  }

  return positions;
}

// ---------------------------------------------------------------------------
// uniformMouseYToLine — pure uniform conversion (fallback)
// ---------------------------------------------------------------------------

describe("uniformMouseYToLine", () => {
  const scrollHeight = 200;
  const totalLines = 100;
  const viewportTop = 5;

  test("click at viewport top with no scroll → line 0", () => {
    expect(uniformMouseYToLine(viewportTop, viewportTop, 0, scrollHeight, totalLines)).toBe(0);
  });

  test("click 1 lineHeight into viewport → line 1", () => {
    const lineHeight = scrollHeight / totalLines;
    expect(uniformMouseYToLine(viewportTop + lineHeight, viewportTop, 0, scrollHeight, totalLines)).toBe(1);
  });

  test("click midway through a line rounds down", () => {
    const lineHeight = scrollHeight / totalLines;
    expect(uniformMouseYToLine(viewportTop + lineHeight * 1.5, viewportTop, 0, scrollHeight, totalLines)).toBe(1);
  });

  test("scroll offset shifts the mapping", () => {
    expect(uniformMouseYToLine(viewportTop, viewportTop, 40, scrollHeight, totalLines)).toBe(20);
  });

  test("clamps to 0 when clicking above viewport", () => {
    expect(uniformMouseYToLine(viewportTop - 10, viewportTop, 0, scrollHeight, totalLines)).toBe(0);
  });

  test("clamps to last line when clicking far below", () => {
    expect(uniformMouseYToLine(viewportTop + 9999, viewportTop, 0, scrollHeight, totalLines)).toBe(99);
  });

  test("adjacent clicks resolve to adjacent lines", () => {
    const lineHeight = scrollHeight / totalLines;
    const a = uniformMouseYToLine(viewportTop + lineHeight * 5, viewportTop, 0, scrollHeight, totalLines);
    const b = uniformMouseYToLine(viewportTop + lineHeight * 6, viewportTop, 0, scrollHeight, totalLines);
    expect(b - a).toBe(1);
  });

  test("returns 0 for zero totalLines", () => {
    expect(uniformMouseYToLine(10, 5, 0, 200, 0)).toBe(0);
  });

  test("returns 0 for zero scrollHeight", () => {
    expect(uniformMouseYToLine(10, 5, 0, 0, 100)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// mouseYToLine — position-based refinement
// ---------------------------------------------------------------------------

describe("mouseYToLine with getLinePosition", () => {
  test("maps clicks to correct lines in a uniform layout", () => {
    const totalLines = 20;
    const viewportTop = 3;
    // Positions in screen-space: line 0 starts at viewportTop
    const positions = uniformPositions(totalLines, viewportTop);
    const getLinePos = makeGetLinePos(positions);

    // Click at screen Y = viewportTop + 5.5 = 8.5
    // position[5] = { y: 3+5, height: 1 } = { y: 8, height: 1 }
    // targetY = 8.5, which is in [8, 9) → line 5
    const line = mouseYToLine(viewportTop + 5.5, viewportTop, 0, 20, totalLines, getLinePos);
    expect(line).toBe(5);
  });

  test("adjacent rows in a code block map to different lines", () => {
    // This is the actual bug scenario: a code block where each source line
    // occupies 1 terminal row, but the uniform model would give lineHeight > 1.
    const positions = realisticPositions([
      { type: "header", lines: 1 },     // line 0 at y=0,  then margin y=1
      { type: "paragraph", lines: 2 },  // lines 1-2 at y=2-3, then margin y=4
      { type: "code", lines: 4 },       // lines 3-6 at y=6-9 (padding at y=5 and y=10)
      { type: "paragraph", lines: 1 },  // line 7 at y=11, margin y=12
    ]);
    const totalLines = positions.length; // 8
    // scrollHeight is the total rendered height (all blocks + margins + padding)
    const scrollHeight = 13;
    const viewportTop = 0;
    const getLinePos = makeGetLinePos(positions);

    // Position-based should always get it right:
    expect(mouseYToLine(viewportTop + 6, viewportTop, 0, scrollHeight, totalLines, getLinePos)).toBe(3);
    expect(mouseYToLine(viewportTop + 7, viewportTop, 0, scrollHeight, totalLines, getLinePos)).toBe(4);
    expect(mouseYToLine(viewportTop + 8, viewportTop, 0, scrollHeight, totalLines, getLinePos)).toBe(5);
    expect(mouseYToLine(viewportTop + 9, viewportTop, 0, scrollHeight, totalLines, getLinePos)).toBe(6);
  });

  test("position-based fixes the 2-adjacent-rows-same-line bug", () => {
    // Simulate a document where uniform lineHeight = 3.0 but code block
    // lines are only 1 row each.
    // Total 10 lines, scrollHeight = 30 → uniform lineHeight = 3.0
    // Lines 5-8 are in a code block with 1-row-per-line at y=16,17,18,19
    const positions: (LinePosition | null)[] = [
      { y: 0, height: 1 },   // line 0 - header
      { y: 3, height: 1 },   // line 1 - paragraph
      { y: 4, height: 1 },   // line 2 - paragraph
      { y: 7, height: 1 },   // line 3 - paragraph
      { y: 10, height: 1 },  // line 4 - paragraph
      { y: 16, height: 1 },  // line 5 - code (after padding)
      { y: 17, height: 1 },  // line 6 - code
      { y: 18, height: 1 },  // line 7 - code
      { y: 19, height: 1 },  // line 8 - code
      { y: 23, height: 1 },  // line 9 - paragraph
    ];
    const totalLines = 10;
    const scrollHeight = 30;
    const viewportTop = 0;
    const getLinePos = makeGetLinePos(positions);

    // With uniform model: lineHeight = 3.0
    // y=16 → floor(16/3) = 5 ✓
    // y=17 → floor(17/3) = 5 ✗ (should be 6!)
    // This is the exact bug the user reported.
    const uniformA = uniformMouseYToLine(16, 0, 0, scrollHeight, totalLines);
    const uniformB = uniformMouseYToLine(17, 0, 0, scrollHeight, totalLines);
    expect(uniformA).toBe(5);
    expect(uniformB).toBe(5); // Bug: both map to line 5

    // With position-based: both correctly resolve
    const posA = mouseYToLine(16, viewportTop, 0, scrollHeight, totalLines, getLinePos);
    const posB = mouseYToLine(17, viewportTop, 0, scrollHeight, totalLines, getLinePos);
    expect(posA).toBe(5);
    expect(posB).toBe(6); // Fixed: correctly resolves to line 6
  });

  test("click in gap between blocks finds closest line", () => {
    // Gap at y=5 (between header margin and paragraph)
    const positions: (LinePosition | null)[] = [
      { y: 0, height: 1 },  // line 0 - header at y=0
      // gap at y=1 (header margin)
      { y: 2, height: 1 },  // line 1 - paragraph at y=2
      { y: 3, height: 1 },  // line 2 - paragraph at y=3
    ];
    const getLinePos = makeGetLinePos(positions);

    // Click in the gap at y=1 — should resolve to closest line
    const line = mouseYToLine(1, 0, 0, 6, 3, getLinePos);
    // Closest: line 0 center=0.5 (dist 0.5) vs line 1 center=2.5 (dist 1.5)
    expect(line).toBe(0);
  });

  test("click in gap closer to next block finds next line", () => {
    const positions: (LinePosition | null)[] = [
      { y: 0, height: 1 },   // line 0
      // gap at y=1, y=2
      { y: 3, height: 1 },   // line 1
    ];
    const getLinePos = makeGetLinePos(positions);

    // Click at y=2.5 — closer to line 1 (center=3.5, dist=1) than line 0 (center=0.5, dist=2)
    const line = mouseYToLine(2.5, 0, 0, 6, 2, getLinePos);
    expect(line).toBe(1);
  });

  test("handles scrolled viewport correctly", () => {
    // 20 lines, each at 1 row, no gaps. Viewport scrolled so that
    // line 10 is at the top of the visible area (screen row = viewportTop).
    // OpenTUI bakes scroll offset into renderable positions (screen-space).
    const scrollTop = 10;
    const viewportTop = 5;
    // Positions in screen-space: line i appears at screen y = i - scrollTop + viewportTop
    // Line 10 → y = 10 - 10 + 5 = 5 (top of visible area)
    // Line 0 → y = 0 - 10 + 5 = -5 (above viewport)
    const positions: LinePosition[] = Array.from({ length: 20 }, (_, i) => ({
      y: i - scrollTop + viewportTop,
      height: 1,
    }));
    const getLinePos = makeGetLinePos(positions);

    // Click at screen Y = 5 (viewportTop) → targetY = 5, pos[10].y = 5 → line 10
    expect(mouseYToLine(5, viewportTop, scrollTop, 20, 20, getLinePos)).toBe(10);
    // Click at screen Y = 8 → targetY = 8, pos[13].y = 8 → line 13
    expect(mouseYToLine(8, viewportTop, scrollTop, 20, 20, getLinePos)).toBe(13);
  });

  test("falls back to uniform when getLinePos is null", () => {
    const line = mouseYToLine(10, 5, 0, 200, 100, null);
    const expected = uniformMouseYToLine(10, 5, 0, 200, 100);
    expect(line).toBe(expected);
  });

  test("falls back to uniform when getLinePos returns null for all lines", () => {
    const getLinePos: GetLinePosition = () => null;
    const line = mouseYToLine(10, 5, 0, 200, 100, getLinePos);
    // Should still return a reasonable value (uniform estimate)
    expect(line).toBeGreaterThanOrEqual(0);
    expect(line).toBeLessThan(100);
  });
});

// ---------------------------------------------------------------------------
// Mouse click + CursorManager state
// ---------------------------------------------------------------------------

describe("mouse click → cursor state", () => {
  const lines = ["Line 0", "Line 1", "Line 2", "Line 3", "Line 4"];

  function makeCursor(): { cursor: CursorManager; updates: { count: number } } {
    const updates = { count: 0 };
    const cursor = createCursorManager(lines.length, () => { updates.count++; });
    return { cursor, updates };
  }

  test("click in normal mode positions cursor", () => {
    const { cursor } = makeCursor();
    cursor.setCursor(3);
    expect(cursor.cursorLine).toBe(3);
    expect(cursor.mode).toBe("normal");
  });

  test("click exits visual mode", () => {
    const { cursor } = makeCursor();
    cursor.setCursor(1);
    cursor.enterVisual();
    cursor.setCursor(3);
    expect(cursor.mode).toBe("visual");

    cursor.exitVisual();
    cursor.setCursor(2);
    expect(cursor.mode).toBe("normal");
    expect(cursor.cursorLine).toBe(2);
  });

  test("click fires onUpdate callback", () => {
    const { cursor, updates } = makeCursor();
    const before = updates.count;
    cursor.setCursor(2);
    expect(updates.count).toBe(before + 1);
  });
});

// ---------------------------------------------------------------------------
// Mouse click + keyboard interleaving
// ---------------------------------------------------------------------------

describe("mouse + keyboard interleaving", () => {
  const lines = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

  function makeCursor(): CursorManager {
    return createCursorManager(lines.length, () => {});
  }

  function simulateClick(cursor: CursorManager, line: number): void {
    if (cursor.mode === "visual") cursor.exitVisual();
    cursor.setCursor(line);
  }

  test("keyboard j/k after click continues from clicked position", () => {
    const cursor = makeCursor();
    simulateClick(cursor, 5);
    cursor.moveCursor(1);
    expect(cursor.cursorLine).toBe(6);
    cursor.moveCursor(-1);
    expect(cursor.cursorLine).toBe(5);
  });

  test("click after keyboard visual mode exits visual and repositions", () => {
    const cursor = makeCursor();
    cursor.setCursor(2);
    cursor.enterVisual();
    cursor.moveCursor(3);
    expect(cursor.mode).toBe("visual");

    simulateClick(cursor, 7);
    expect(cursor.mode).toBe("normal");
    expect(cursor.cursorLine).toBe(7);
  });

  test("Escape after visual mode cancels it", () => {
    const cursor = makeCursor();
    cursor.setCursor(2);
    cursor.enterVisual();
    cursor.setCursor(5);
    cursor.exitVisual();
    expect(cursor.mode).toBe("normal");
    expect(cursor.cursorLine).toBe(5);
  });

  test("rapid click-click-click ends at last clicked line", () => {
    const cursor = makeCursor();
    simulateClick(cursor, 2);
    simulateClick(cursor, 7);
    simulateClick(cursor, 4);
    expect(cursor.mode).toBe("normal");
    expect(cursor.cursorLine).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// mouseYToLine with realistic layout (no drag — just coordinate tests)
// ---------------------------------------------------------------------------

describe("mouseYToLine with realistic layout", () => {
  // Simulates a README-like document:
  //   - Header (1 line + margin)
  //   - Paragraph (2 lines + margin)
  //   - Code block (4 lines + top/bottom padding)
  //   - Paragraph (1 line)
  // Total: 8 source lines, rendered height ~13 rows
  const positions = realisticPositions([
    { type: "header", lines: 1 },
    { type: "paragraph", lines: 2 },
    { type: "code", lines: 4 },
    { type: "paragraph", lines: 1 },
  ]);
  const totalLines = positions.length; // 8
  const scrollHeight = 13;
  const viewportTop = 0;
  const getLinePos = makeGetLinePos(positions);

  // Code block lines are at y=6,7,8,9 (lines 3,4,5,6)

  test("clicking each code block row resolves to the correct line", () => {
    expect(mouseYToLine(6, viewportTop, 0, scrollHeight, totalLines, getLinePos)).toBe(3);
    expect(mouseYToLine(7, viewportTop, 0, scrollHeight, totalLines, getLinePos)).toBe(4);
    expect(mouseYToLine(8, viewportTop, 0, scrollHeight, totalLines, getLinePos)).toBe(5);
    expect(mouseYToLine(9, viewportTop, 0, scrollHeight, totalLines, getLinePos)).toBe(6);
  });

  test("clicking header and clicking code block give different lines", () => {
    const headerLine = mouseYToLine(0, viewportTop, 0, scrollHeight, totalLines, getLinePos);
    const codeLine = mouseYToLine(6, viewportTop, 0, scrollHeight, totalLines, getLinePos);
    expect(headerLine).toBe(0);
    expect(codeLine).toBe(3);
  });

  test("clicking code block padding (gap) resolves to nearest code line", () => {
    // Code block top padding is at y=5, first code line at y=6
    const line = mouseYToLine(5, viewportTop, 0, scrollHeight, totalLines, getLinePos);
    // Nearest: line 2 (center=3.5, dist=1.5) vs line 3 (center=6.5, dist=1.5)
    // Both equidistant — either is acceptable
    expect(line).toBeGreaterThanOrEqual(2);
    expect(line).toBeLessThanOrEqual(3);
  });
});
