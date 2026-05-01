/**
 * Definition list rendering — pandoc-style `term\n: definition` syntax via
 * `remark-deflist`. Produces a stack of `Term` rows followed by indented
 * description rows, mirroring how a `<dl>` reads in a browser without any
 * unicode trickery.
 */

import { BoxRenderable, TextRenderable, type CliRenderer, TextAttributes } from "@opentui/core";
import type { ThemeColors } from "../types.js";
import type { Token } from "marked";
import { convertInlineToken } from "./text.js";

interface DefListToken {
  type: "deflist";
  items: Array<{ term: Token[]; defs: Token[][] }>;
}

function renderInlineRow(
  renderer: CliRenderer,
  colors: ThemeColors,
  tokens: Token[],
  baseFg: string,
  baseBold: boolean,
): TextRenderable {
  const parts = tokens.map((t) => convertInlineToken(t, colors)?.segment.text ?? "").join("");
  return new TextRenderable(renderer, {
    content: parts,
    fg: baseFg,
    attributes: baseBold ? TextAttributes.BOLD : 0,
  });
}

export function renderDefList(
  renderer: CliRenderer,
  colors: ThemeColors,
  token: Token,
): BoxRenderable {
  const t = token as unknown as DefListToken;
  const wrapper = new BoxRenderable(renderer, {
    flexDirection: "column",
    marginTop: 1,
    marginBottom: 1,
  });
  for (const item of t.items) {
    wrapper.add(renderInlineRow(renderer, colors, item.term, colors.fg, true));
    for (const def of item.defs) {
      const indent = new BoxRenderable(renderer, {
        flexDirection: "row",
        paddingLeft: 4,
      });
      indent.add(renderInlineRow(renderer, colors, def, colors.gray, false));
      wrapper.add(indent);
    }
  }
  return wrapper;
}
