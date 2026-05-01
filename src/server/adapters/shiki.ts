/**
 * Default code-block adapter: Shiki syntax highlighting.
 *
 * Claims "*", so it handles every fence language no other adapter claimed.
 * For unknown languages Shiki itself falls back to a plain <pre> with
 * escaped HTML — see shikiToHtml.
 *
 * When `dual` is set, the adapter emits dual-theme HTML (CSS-var based) so
 * the browser swaps themes via `prefers-color-scheme` without a server
 * roundtrip. Otherwise renders single-theme as before.
 */

import type { CodeAdapter } from "./index.js";
import {
  shikiToHtml,
  shikiToHtmlDual,
  type HighlighterInstance,
} from "../../highlighting/shiki.js";

export interface ShikiAdapterOptions {
  /** When set, render with both themes for client-side appearance switching. */
  dual?: { light: string; dark: string };
}

export function createShikiAdapter(
  highlighter: HighlighterInstance,
  opts: ShikiAdapterOptions = {},
): CodeAdapter {
  const { dual } = opts;
  return {
    langs: ["*"],
    render(code, lang) {
      if (dual) return shikiToHtmlDual(highlighter, code, lang, dual);
      return shikiToHtml(highlighter, code, lang);
    },
  };
}
