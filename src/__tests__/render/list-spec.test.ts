import { describe, it, expect } from "bun:test";
import { listToSpec } from "../../rendering/list.js";
import type { ThemeColors, ListToken } from "../../types.js";

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

function makeToken(items: Array<{ text: string }>, ordered = false): ListToken {
  return {
    ordered,
    items: items.map((i) => ({ type: "list_item", text: i.text })),
  };
}

describe("listToSpec", () => {
  it("emits a column-flex box wrapping one BoxSpec per item", () => {
    const spec = listToSpec(colors, makeToken([{ text: "a" }, { text: "b" }, { text: "c" }]));

    expect(spec.kind).toBe("box");
    expect(spec.flexDirection).toBe("column");
    expect(spec.marginTop).toBe(1);
    expect(spec.marginBottom).toBe(1);
    expect(spec.children).toHaveLength(3);
    for (const item of spec.children) {
      expect(item.kind).toBe("box");
      // First child of each item is the text spec (bullet + content).
      expect(item.kind === "box" && item.children[0]!.kind === "text").toBe(true);
    }
  });

  it("uses bullet marker for unordered, number for ordered", () => {
    const unordered = listToSpec(colors, makeToken([{ text: "a" }]));
    const ordered = listToSpec(colors, makeToken([{ text: "a" }, { text: "b" }], true));

    const firstText = (s: typeof unordered) =>
      s.children[0]!.kind === "box"
        ? (s.children[0]!.children[0] as { chunks?: Array<{ text: string }> }).chunks?.[0]?.text
        : "";

    expect(firstText(unordered)).toBe("• ");
    expect(firstText(ordered)).toBe("1. ");

    const secondMarker = (ordered.children[1]!.kind === "box"
      ? (ordered.children[1]!.children[0] as { chunks?: Array<{ text: string }> }).chunks?.[0]?.text
      : "");
    expect(secondMarker).toBe("2. ");
  });

  it("inner lists have zero margins so they stack against their parent item", () => {
    const nested: ListToken = {
      ordered: false,
      items: [
        {
          type: "list_item",
          text: "outer",
          tokens: [
            { type: "text", text: "outer", raw: "outer" } as never,
            {
              type: "list",
              raw: "",
              ordered: false,
              start: "",
              loose: false,
              items: [{ type: "list_item", text: "inner", raw: "inner", loose: false, task: false }],
            } as never,
          ],
        },
      ],
    };
    const spec = listToSpec(colors, nested);
    const item = spec.children[0]!;
    expect(item.kind === "box" && item.children[1]!.kind).toBe("box");
    const inner = item.kind === "box" ? (item.children[1] as { marginTop?: number; marginBottom?: number }) : ({} as never);
    expect(inner.marginTop).toBe(0);
    expect(inner.marginBottom).toBe(0);
  });

  it("indents nested items by depth", () => {
    const nested: ListToken = {
      ordered: false,
      items: [
        {
          type: "list_item",
          text: "outer",
          tokens: [
            {
              type: "list",
              raw: "",
              ordered: false,
              start: "",
              loose: false,
              items: [{ type: "list_item", text: "inner", raw: "inner", loose: false, task: false }],
            } as never,
          ],
        },
      ],
    };
    const spec = listToSpec(colors, nested);
    const innerListBox = spec.children[0]!.kind === "box" ? (spec.children[0]!.children[1] as { kind: "box"; children: unknown[] }) : ({} as never);
    const innerItem = innerListBox.children[0] as { kind: "box"; children: unknown[] };
    const innerText = innerItem.children[0] as { chunks: Array<{ text: string }> };
    // depth=1 indent is 2 spaces before the bullet.
    expect(innerText.chunks[0]!.text).toBe("  • ");
  });
});
