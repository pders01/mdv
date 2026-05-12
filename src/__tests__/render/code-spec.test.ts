import { describe, it, expect } from "bun:test";
import { codeBlockToSpec } from "../../rendering/code.js";
import type { ThemeColors } from "../../types.js";

const colors: ThemeColors = {
  fg: "#ffffff",
  bg: "#000000",
  link: "#3399ff",
  red: "#ff0000",
  orange: "#ff8800",
  yellow: "#ffff00",
  green: "#00ff00",
  cyan: "#00ffff",
  blue: "#0000ff",
  purple: "#aa00aa",
  gray: "#888888",
  codeBg: "#222222",
};

describe("codeBlockToSpec", () => {
  it("emits a box with padding 1 wrapping a single text child", () => {
    const spec = codeBlockToSpec(colors, undefined, { text: "const x = 1\nconst y = 2" }, 5);

    expect(spec.kind).toBe("box");
    expect(spec.padding).toBe(1);
    expect(spec.marginTop).toBe(1);
    expect(spec.marginBottom).toBe(1);
    expect(spec.children).toHaveLength(1);
    expect(spec.children[0]!.kind).toBe("text");
  });

  it("records source span covering the open fence, content, close fence", () => {
    // Two content lines starting after open fence at source line 5:
    //   5: ```
    //   6: const x = 1
    //   7: const y = 2
    //   8: ```
    const spec = codeBlockToSpec(colors, undefined, { text: "const x = 1\nconst y = 2" }, 5);
    expect(spec.source).toEqual({ start: 5, end: 8 });
  });

  it("emits one TextLine per content line with cell-aware displayWidth", () => {
    const spec = codeBlockToSpec(colors, undefined, { text: "abc\n中文 mix" }, 0);
    const text = spec.children[0] as { lines?: Array<{ sourceLine: number; displayWidth: number; displayText: string }> };

    expect(text.lines).toHaveLength(2);
    expect(text.lines![0]).toEqual({ sourceLine: 1, displayWidth: 3, displayText: "abc" });
    // "中文 mix" = 2+2+1+3 = 8 cells (not 7 chars).
    expect(text.lines![1]).toEqual({ sourceLine: 2, displayWidth: 8, displayText: "中文 mix" });
  });

  it("respects wrapMode passthrough", () => {
    const spec = codeBlockToSpec(colors, undefined, { text: "x" }, 0, "none");
    const text = spec.children[0] as { wrapMode?: string };
    expect(text.wrapMode).toBe("none");
  });
});
