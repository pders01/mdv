/**
 * Default code-block adapter: Shiki syntax highlighting.
 *
 * Claims "*", so it handles every fence language no other adapter claimed.
 * For unknown languages Shiki itself falls back to a plain <pre> with
 * escaped HTML — see shikiToHtml.
 */

import type { CodeAdapter } from "./index.js";
import { shikiToHtml, type HighlighterInstance } from "../../highlighting/shiki.js";

export function createShikiAdapter(highlighter: HighlighterInstance): CodeAdapter {
  return {
    langs: ["*"],
    render(code, lang) {
      return shikiToHtml(highlighter, code, lang);
    },
  };
}
