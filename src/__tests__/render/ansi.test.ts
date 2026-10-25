import { describe, expect, it } from "bun:test";
import { RGBA } from "@opentui/core";
import { specsToAnsi, terminalText } from "../../render/ansi.js";
import { documentToSpecs } from "../../render/document.js";
import { createSpecRenderer } from "../../rendering/index.js";
import { createHighlighterInstance, loadLangsForContent } from "../../highlighting/shiki.js";
import { TEST_COLORS } from "../helpers/render-harness.js";
import { cellWidth } from "../../util/width.js";
import type { Spec, TextSpec } from "../../render/spec.js";

function text(value: string, wrapMode?: TextSpec["wrapMode"]): TextSpec {
  return { kind: "text", source: null, chunks: [{ __isChunk: true, text: value }], wrapMode };
}
function plain(specs: Spec[], width = 20): string {
  return specsToAnsi(specs, { width, color: false });
}
const highlighter = await createHighlighterInstance("github-dark");
function markdown(content: string, width = 20): Spec[] {
  return documentToSpecs(content, createSpecRenderer(TEST_COLORS, highlighter, width));
}

describe("ANSI backend", () => {
  it("produces no output for empty or hidden documents", () => {
    expect(plain([])).toBe("");
    expect(plain(markdown("---\ntitle: Hidden\n---\n"))).toBe("");
    expect(plain(markdown("[link]: https://example.com"))).toBe("");
  });

  it("shares extension parsing, concealment, and source positions", () => {
    const specs = markdown(
      "# Hello **world**\n\nH~2~O and x^2^; ==marked==; bare:\n\nTerm\n: Definition",
    );
    const output = plain(specs);
    expect(output).toContain("Hello world");
    expect(output).toContain("H₂O and x²");
    expect(output).toContain("marked");
    expect(output).toContain("bare:");
    expect(output).toContain("Definition");
    expect(specs[0]!.source).toEqual({ start: 0, end: 0 });
    expect(specs[1]!.source).toEqual({ start: 2, end: 2 });
  });

  it("wraps words across styling boundaries and handles exact-width words", () => {
    const spec = text("");
    spec.chunks = [
      { __isChunk: true, text: "hello ", bold: true },
      { __isChunk: true, text: "world again", italic: true },
    ];
    expect(plain([spec], 5)).toBe("hello\nworld\nagain\n");
    expect(plain([text("one two three")], 7)).toBe("one two\nthree\n");
    expect(plain([text("abcdefgh")], 3)).toBe("abc\ndef\ngh\n");
  });

  it("keeps Unicode graphemes intact and uses terminal cell widths", () => {
    expect(plain([text("中文中文", "char")], 4)).toBe("中文\n中文\n");
    expect(plain([text("e\u0301e\u0301e\u0301", "char")], 2)).toBe("éé\né\n");
    expect(plain([text("👩‍💻👩‍💻", "char")], 2)).toBe("👩‍💻\n👩‍💻\n");
    expect(plain([text("中", "char")], 1)).toBe("�\n");
  });

  it("honors char, no-wrap, tabs, and explicit newlines", () => {
    expect(plain([text("ab cd", "char")], 3)).toBe("ab\ncd\n");
    expect(plain([text("abcdef\nxyz", "none")], 3)).toBe("abc\nxyz\n");
    expect(plain([text("a\tb", "char")], 8)).toBe("a   b\n");
    expect(plain([text("a\n\nb")])).toBe("a\n\nb\n");
  });

  it("lays out row prefixes, column stacks, padding, and margins", () => {
    const spec: Spec = {
      kind: "box",
      source: null,
      paddingLeft: 2,
      marginBottom: 1,
      children: [
        {
          kind: "box",
          source: null,
          flexDirection: "row",
          children: [text("│ "), text("hello world")],
        },
      ],
    };
    expect(plain([spec, text("next")], 9)).toBe("  │ hello\n    world\n\nnext\n");
  });

  it("preserves code text and paints code-local backgrounds with line resets", () => {
    const spec: Spec = {
      kind: "box",
      block: "code",
      source: null,
      padding: 1,
      children: [text("let x = 1")],
    };
    const output = specsToAnsi([spec], {
      width: 16,
      color: true,
      foreground: "#ffffff",
      codeBackground: "#112233",
    });
    expect(output).toContain("48;2;17;34;51");
    expect(terminalText(output)).toBe(" let x = 1      \n");
    expect(output).toEndWith("\x1b[0m\n");
  });

  it("emits truecolor and attributes only when enabled", () => {
    const spec = text("styled");
    spec.chunks[0] = {
      __isChunk: true,
      text: "styled",
      fg: RGBA.fromHex("#123456"),
      bold: true,
      italic: true,
    };
    expect(specsToAnsi([spec], { width: 20, color: true })).toBe(
      "\x1b[0;1;3;38;2;18;52;86mstyled\x1b[0m\n",
    );
    expect(plain([spec])).toBe("styled\n");
  });

  it("uses Shiki colors for code", async () => {
    const source = "```ts\nconst answer = 42;\n```";
    await loadLangsForContent(highlighter, source);
    const output = specsToAnsi(markdown(source, 40), { width: 40, color: true });
    expect(output).toContain("38;2;");
    expect(terminalText(output)).toContain("const answer = 42;");
  });

  it("renders tables, quotes, nested lists, and definitions at narrow widths", () => {
    const source =
      "| Key | Value |\n| --- | --- |\n| Name | Long value here |\n\n> quote with several words\n\n- first\n  - nested\n\nTerm\n: Definition";
    for (const width of [1, 4, 12, 30, 80]) {
      const output = plain(markdown(source, width), width);
      for (const line of output.split("\n")) expect(cellWidth(line)).toBeLessThanOrEqual(width);
      if (width >= 12) {
        expect(output).toContain("nested");
        expect(output.replace(/\s/g, "")).toContain("Definition");
      }
    }
  });

  it("removes document-controlled terminal sequences", () => {
    const input = "safe\x1b[2J\x1b]52;c;payload\x07\x1bPcontrol\x1b\\\x00\x9b end";
    expect(plain([text(input)])).toBe("safe end\n");
    expect(terminalText("\x1b]unterminated")).toBe("");
  });

  it("rejects invalid widths", () => {
    for (const width of [0, -1, 1.5, NaN, Infinity])
      expect(() => plain([], width)).toThrow("positive integer");
  });
});
