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
