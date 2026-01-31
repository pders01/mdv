/**
 * Syntax style definitions for markdown rendering
 */

import { SyntaxStyle, RGBA } from "@opentui/core";
import type { ThemeColors } from "../types.js";

/**
 * Create a SyntaxStyle instance from theme colors
 */
export function createSyntaxStyle(colors: ThemeColors): SyntaxStyle {
  return SyntaxStyle.fromStyles({
    "markup.heading": { fg: RGBA.fromHex(colors.blue), bold: true },
    "markup.heading.1": { fg: RGBA.fromHex(colors.red), bold: true },
    "markup.heading.2": { fg: RGBA.fromHex(colors.orange), bold: true },
    "markup.heading.3": { fg: RGBA.fromHex(colors.yellow), bold: true },
    "markup.heading.4": { fg: RGBA.fromHex(colors.green), bold: true },
    "markup.heading.5": { fg: RGBA.fromHex(colors.cyan), bold: true },
    "markup.heading.6": { fg: RGBA.fromHex(colors.purple), bold: true },
    "markup.bold": { fg: RGBA.fromHex(colors.fg), bold: true },
    "markup.strong": { fg: RGBA.fromHex(colors.fg), bold: true },
    "markup.italic": { fg: RGBA.fromHex(colors.fg), italic: true },
    "markup.strikethrough": { fg: RGBA.fromHex(colors.gray), dim: true },
    "markup.list": { fg: RGBA.fromHex(colors.cyan) },
    "markup.quote": { fg: RGBA.fromHex(colors.gray), italic: true },
    "markup.raw": { fg: RGBA.fromHex(colors.cyan), bg: RGBA.fromHex(colors.codeBg) },
    "markup.raw.block": { fg: RGBA.fromHex(colors.cyan), bg: RGBA.fromHex(colors.codeBg) },
    "markup.link": { fg: RGBA.fromHex(colors.link) },
    "markup.link.url": { fg: RGBA.fromHex(colors.blue) },
    "markup.link.label": { fg: RGBA.fromHex(colors.link) },
    default: { fg: RGBA.fromHex(colors.fg) },
  });
}
