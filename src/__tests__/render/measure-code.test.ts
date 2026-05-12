import { describe, it, expect } from "bun:test";
import { measureCodeBlock } from "../../render/measure-code.js";
import { codeBlockToSpec } from "../../rendering/code.js";
import type { ThemeColors } from "../../types.js";

const colors: ThemeColors = {
  fg: "#fff",
  bg: "#000",
  link: "#0af",
  red: "#f00",
  orange: "#fa0",
  yellow: "#ff0",
  green: "#0f0",
  cyan: "#0ff",
  blue: "#00f",
  purple: "#a0a",
  gray: "#888",
  codeBg: "#222",
};

describe("measureCodeBlock", () => {
  it("assigns one row per source line when nothing wraps", () => {
    const spec = codeBlockToSpec(colors, undefined, { text: "a\nb\nc" }, 0);
    const m = measureCodeBlock(spec, 80);

    expect(m.innerYStart).toBe(1); // padding = 1
    expect(m.innerHeight).toBe(3);
    expect(m.lines.map((l) => l.height)).toEqual([1, 1, 1]);
    expect(m.lines.map((l) => l.innerY)).toEqual([0, 1, 2]);
  });

  it("inflates only the wrapped source line, not its successors", () => {
    // 20-wide content area: first line is 25 cells (wraps to 2), others 5.
    // Successor lines must remain 1 row each, with y stepping past the
    // wrap — this is the structural fix for the cursor-double-highlight
    // bug where uniform divide spread the extra row across all lines.
    const long = "x".repeat(25);
    const spec = codeBlockToSpec(colors, undefined, { text: `${long}\nshort\nalso` }, 0);
    const m = measureCodeBlock(spec, 22); // contentWidth = 22 - 2 = 20

    expect(m.lines[0]).toEqual({ sourceLine: 1, innerY: 0, height: 2 });
    expect(m.lines[1]).toEqual({ sourceLine: 2, innerY: 2, height: 1 });
    expect(m.lines[2]).toEqual({ sourceLine: 3, innerY: 3, height: 1 });
    expect(m.innerHeight).toBe(4);
  });

  it("uses cell-width so CJK content wraps correctly", () => {
    // "中文中文" = 8 cells, contentWidth = 4 → wraps to 2.
    const spec = codeBlockToSpec(colors, undefined, { text: "中文中文" }, 0);
    const m = measureCodeBlock(spec, 6); // contentWidth = 6 - 2 = 4

    expect(m.lines[0]!.height).toBe(2);
    expect(m.innerHeight).toBe(2);
  });

  it("clamps to at least one row per source line for empty lines", () => {
    const spec = codeBlockToSpec(colors, undefined, { text: "a\n\nb" }, 0);
    const m = measureCodeBlock(spec, 80);

    expect(m.lines.map((l) => l.height)).toEqual([1, 1, 1]);
    expect(m.innerHeight).toBe(3);
  });
});
