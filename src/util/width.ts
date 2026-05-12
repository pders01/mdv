/**
 * Display-width helpers. JavaScript's `.length` counts UTF-16 code units —
 * 1 for ASCII, 1 for BMP CJK (yet 2 cells wide in a terminal), 2 for
 * surrogate-paired emoji. Anywhere mdv computes a terminal column or cell
 * span from a string must go through `cellWidth` instead.
 */

import stringWidth from "string-width";

export function cellWidth(s: string): number {
  return stringWidth(s);
}

/**
 * Column offset (in display cells) of `charIdx` within `s`. Slicing a JS
 * string at a char index and measuring the result gives the visual column
 * the renderer paints that index at.
 */
export function cellColumn(s: string, charIdx: number): number {
  if (charIdx <= 0) return 0;
  return stringWidth(s.slice(0, charIdx));
}

/**
 * Take the longest prefix of `s` whose display width fits in `budget`
 * cells. CJK / emoji that would overflow the budget are dropped rather
 * than half-rendered, which keeps column layouts intact.
 */
export function takeUpToCellWidth(s: string, budget: number): string {
  if (budget <= 0) return "";
  let used = 0;
  let out = "";
  for (const ch of s) {
    const w = stringWidth(ch);
    if (used + w > budget) break;
    out += ch;
    used += w;
  }
  return out;
}

/**
 * Truncate `s` to at most `max` display cells, replacing trailing chars
 * with `…` when the input is wider. The ellipsis itself costs 1 cell.
 */
export function truncateToCellWidth(s: string, max: number): string {
  if (stringWidth(s) <= max) return s;
  if (max <= 1) return takeUpToCellWidth(s, max);
  return takeUpToCellWidth(s, max - 1) + "…";
}
