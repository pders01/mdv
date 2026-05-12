import { describe, it, expect } from "bun:test";
import { paragraphToSpec } from "../../rendering/paragraph.js";
import type { ThemeColors, ParagraphToken } from "../../types.js";

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

function plain(text: string): ParagraphToken {
  return { text, tokens: [{ type: "text", text } as never] };
}

describe("paragraphToSpec", () => {
  it("returns null for a paragraph with no segments", () => {
    expect(paragraphToSpec(colors, { text: "", tokens: [] })).toBeNull();
  });

  it("emits a box with marginBottom 1 wrapping a single text spec", () => {
    const spec = paragraphToSpec(colors, plain("hello world"));
    expect(spec).not.toBeNull();
    expect(spec!.kind).toBe("box");
    expect(spec!.marginBottom).toBe(1);
    expect(spec!.marginTop).toBeUndefined();
    expect(spec!.children).toHaveLength(1);
    expect(spec!.children[0]!.kind).toBe("text");
  });

  it("converts theme-colored segments to RGBA-tagged chunks", () => {
    const spec = paragraphToSpec(colors, plain("plain text"));
    const text = spec!.children[0] as { chunks: Array<{ text: string; fg?: { r: number; g: number; b: number } }> };
    expect(text.chunks).toHaveLength(1);
    expect(text.chunks[0]!.text).toBe("plain text");
    // fg should be present (RGBA.fromHex result) — null check is enough; we
    // don't snapshot the RGBA value because colors are theme-dependent.
    expect(text.chunks[0]!.fg).toBeDefined();
  });
});
