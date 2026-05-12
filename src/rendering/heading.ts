/**
 * Heading rendering — depth-based color + bold, with `### ` prefix
 * markers retained for h3+.
 *
 * Headings used to be inlined in the renderNode dispatcher; pulling
 * them into their own file mirrors the other renderers and keeps the
 * spec emission close to the depth/color/prefix decisions that define
 * the heading visually.
 */

import { RGBA } from "@opentui/core";
import type { ThemeColors } from "../types.js";
import type { BoxSpec } from "../render/spec.js";

export interface HeadingToken {
  type: "heading";
  depth: number;
  text: string;
}

/**
 * Depth-keyed palette: h1 red, h2 orange, h3 yellow, h4 green, h5 cyan, h6 blue.
 * Out-of-range depths fall back to the last entry (h6 blue).
 */
function headingColor(colors: ThemeColors, depth: number): string {
  const palette = [colors.red, colors.orange, colors.yellow, colors.green, colors.cyan, colors.blue];
  return palette[Math.min(Math.max(depth, 1) - 1, palette.length - 1)]!;
}

export function headingToSpec(colors: ThemeColors, token: HeadingToken): BoxSpec {
  const color = headingColor(colors, token.depth);
  // h1/h2 read as clean uppercase text. h3+ keep the `###` prefix so
  // depth is legible without color cues — accessibility for low-contrast
  // themes.
  const prefix = token.depth <= 2 ? "" : "#".repeat(token.depth) + " ";

  return {
    kind: "box",
    block: "heading",
    marginTop: token.depth <= 2 ? 2 : 1,
    marginBottom: 1,
    source: null,
    children: [
      {
        kind: "text",
        chunks: [
          {
            __isChunk: true,
            text: prefix + token.text,
            fg: RGBA.fromHex(color),
            bold: true,
          },
        ],
        source: null,
      },
    ],
  };
}

