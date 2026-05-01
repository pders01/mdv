/**
 * Cursor/input handling tests
 */

import { describe, test, expect } from "bun:test";
import { createCursorManager, CursorManager } from "../input/cursor.js";

describe("CursorManager", () => {
  const sampleLines = ["Line 1", "Line 2", "Line 3", "Line 4", "Line 5"];

  test("starts in normal mode at line 0", () => {
    const cursor = createCursorManager(sampleLines.length, () => {});

    expect(cursor.mode).toBe("normal");
    expect(cursor.cursorLine).toBe(0);
  });

  test("enters visual mode with anchor at cursor", () => {
    const cursor = createCursorManager(sampleLines.length, () => {});

    cursor.setCursor(2);
    cursor.enterVisual();

    expect(cursor.mode).toBe("visual");
    expect(cursor.anchorLine).toBe(2);
    expect(cursor.cursorLine).toBe(2);
  });

  test("exits visual mode back to normal", () => {
    const cursor = createCursorManager(sampleLines.length, () => {});

    cursor.enterVisual();
    cursor.exitVisual();

    expect(cursor.mode).toBe("normal");
  });

  test("moves cursor down", () => {
    const cursor = createCursorManager(sampleLines.length, () => {});

    cursor.moveCursor(2);

    expect(cursor.cursorLine).toBe(2);
  });

  test("moves cursor up", () => {
    const cursor = createCursorManager(sampleLines.length, () => {});

    cursor.setCursor(3);
    cursor.moveCursor(-2);

    expect(cursor.cursorLine).toBe(1);
  });

  test("clamps cursor to last line", () => {
    const cursor = createCursorManager(sampleLines.length, () => {});

    cursor.moveCursor(100);

    expect(cursor.cursorLine).toBe(4); // Last line (0-indexed)
  });

  test("clamps cursor to first line", () => {
    const cursor = createCursorManager(sampleLines.length, () => {});

    cursor.setCursor(2);
    cursor.moveCursor(-100);

    expect(cursor.cursorLine).toBe(0);
  });

  test("moveToFirst sets cursor to 0", () => {
    const cursor = createCursorManager(sampleLines.length, () => {});

    cursor.setCursor(3);
    cursor.moveToFirst();

    expect(cursor.cursorLine).toBe(0);
  });

  test("moveToLast sets cursor to last line", () => {
    const cursor = createCursorManager(sampleLines.length, () => {});

    cursor.moveToLast();

    expect(cursor.cursorLine).toBe(4);
  });

  test("selectionStart/End returns correct range in visual mode", () => {
    const cursor = createCursorManager(sampleLines.length, () => {});

    cursor.setCursor(1);
    cursor.enterVisual();
    cursor.moveCursor(2); // cursor now at 3

    expect(cursor.selectionStart).toBe(1); // anchor
    expect(cursor.selectionEnd).toBe(3); // cursor
  });

  test("selection works when cursor is before anchor", () => {
    const cursor = createCursorManager(sampleLines.length, () => {});

    cursor.setCursor(3);
    cursor.enterVisual();
    cursor.moveCursor(-2); // cursor now at 1

    expect(cursor.selectionStart).toBe(1); // cursor (smaller)
    expect(cursor.selectionEnd).toBe(3); // anchor (larger)
  });

  test("getSelectedContent returns correct lines", () => {
    const cursor = createCursorManager(sampleLines.length, () => {});

    cursor.setCursor(1);
    cursor.enterVisual();
    cursor.moveCursor(2); // lines 1-3

    const content = cursor.getSelectedContent(sampleLines);
    expect(content).toBe("Line 2\nLine 3\nLine 4");
  });

  test("getSelectedContent in normal mode returns cursor line", () => {
    const cursor = createCursorManager(sampleLines.length, () => {});

    cursor.setCursor(2);

    const content = cursor.getSelectedContent(sampleLines);
    expect(content).toBe("Line 3");
  });

  test("getSelectedLineCount returns correct count", () => {
    const cursor = createCursorManager(sampleLines.length, () => {});

    cursor.setCursor(0);
    cursor.enterVisual();
    cursor.moveCursor(2);

    expect(cursor.getSelectedLineCount()).toBe(3);
  });

  test("getSelectedLineCount in normal mode returns 1", () => {
    const cursor = createCursorManager(sampleLines.length, () => {});

    cursor.setCursor(2);

    expect(cursor.getSelectedLineCount()).toBe(1);
  });

  test("moveCursor calls update callback", () => {
    let updateCount = 0;
    const cursor = createCursorManager(sampleLines.length, () => {
      updateCount++;
    });

    cursor.moveCursor(1);
    cursor.moveCursor(1);

    expect(updateCount).toBe(2);
  });
});

describe("createCursorManager factory", () => {
  test("returns CursorManager instance", () => {
    const cursor = createCursorManager(5, () => {});
    expect(cursor).toBeInstanceOf(CursorManager);
  });

  test("handles zero lines", () => {
    const cursor = createCursorManager(0, () => {});
    expect(cursor.mode).toBe("normal");
    expect(cursor.cursorLine).toBe(0);
  });
});

describe("CursorManager cursorable predicate", () => {
  // Layout: lines 0,1,2 mapped, line 3 blank, lines 4,5 mapped, line 6 blank,
  // lines 7,8 mapped. Models a typical paragraph-blank-paragraph rhythm.
  const isCursorable = (line: number) => line !== 3 && line !== 6;
  const totalLines = 9;

  function newCursor() {
    const c = createCursorManager(totalLines, () => {});
    c.setCursorablePredicate(isCursorable);
    return c;
  }

  test("moveCursor down skips a blank line", () => {
    const c = newCursor();
    c.setCursor(2);
    c.moveCursor(1);
    // would land on 3 (blank); snaps down to 4
    expect(c.cursorLine).toBe(4);
  });

  test("moveCursor up skips a blank line", () => {
    const c = newCursor();
    c.setCursor(4);
    c.moveCursor(-1);
    // would land on 3 (blank); snaps up to 2
    expect(c.cursorLine).toBe(2);
  });

  test("moveCursor by larger delta still ends on cursorable", () => {
    const c = newCursor();
    c.setCursor(2);
    c.moveCursor(4);
    // 2 -> 6 (blank) -> snap down to 7
    expect(c.cursorLine).toBe(7);
  });

  test("setCursor onto a blank line snaps downward", () => {
    const c = newCursor();
    c.setCursor(3);
    expect(c.cursorLine).toBe(4);
  });

  test("moveToFirst snaps down if line 0 is blank", () => {
    const c = createCursorManager(totalLines, () => {});
    c.setCursorablePredicate((line) => line >= 2);
    c.moveToFirst();
    expect(c.cursorLine).toBe(2);
  });

  test("moveToLast snaps up if last line is blank", () => {
    const c = createCursorManager(totalLines, () => {});
    c.setCursorablePredicate((line) => line <= 5);
    c.moveToLast();
    expect(c.cursorLine).toBe(5);
  });

  test("moveCursor at top boundary holds when no cursorable line above", () => {
    const c = newCursor();
    c.setCursor(0);
    c.moveCursor(-1);
    // already at top; no cursorable line above; cursor stays put
    expect(c.cursorLine).toBe(0);
  });

  test("default predicate (none set) accepts every line", () => {
    const c = createCursorManager(totalLines, () => {});
    c.setCursor(3);
    expect(c.cursorLine).toBe(3);
  });
});
