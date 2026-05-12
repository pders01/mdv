/**
 * Definition list rendering — pandoc-style `term\n: definition` syntax via
 * `remark-deflist`. Produces a stack of `Term` rows followed by indented
 * description rows, mirroring how a `<dl>` reads in a browser without any
 * unicode trickery.
 */

import { RGBA } from "@opentui/core";
import type { Token } from "marked";
import type { ThemeColors, TextChunk } from "../types.js";
import type { BoxSpec, TextSpec } from "../render/spec.js";
import { convertInlineToken } from "./text.js";

interface DefListToken {
  type: "deflist";
  items: Array<{ term: Token[]; defs: Token[][] }>;
}

function inlineRowSpec(
  colors: ThemeColors,
  tokens: Token[],
  baseFg: string,
  bold: boolean,
): TextSpec {
  const text = tokens.map((t) => convertInlineToken(t, colors)?.segment.text ?? "").join("");
  const chunk: TextChunk = {
    __isChunk: true,
    text,
    fg: RGBA.fromHex(baseFg),
    ...(bold ? { bold: true } : {}),
  };
  return { kind: "text", chunks: [chunk], source: null };
}

export function defListToSpec(colors: ThemeColors, token: Token): BoxSpec {
  const t = token as unknown as DefListToken;
  const children: BoxSpec["children"] = [];
  for (const item of t.items) {
    children.push(inlineRowSpec(colors, item.term, colors.fg, true));
    for (const def of item.defs) {
      children.push({
        kind: "box",
        paddingLeft: 4,
        flexDirection: "row",
        source: null,
        children: [inlineRowSpec(colors, def, colors.gray, false)],
      });
    }
  }
  return {
    kind: "box",
    block: "deflist",
    flexDirection: "column",
    marginTop: 1,
    marginBottom: 1,
    source: null,
    children,
  };
}

