/**
 * Theme color extraction from Shiki
 */

import type { Highlighter, BundledTheme } from "shiki";
import type { ThemeColors } from "../types.js";

/**
 * Extract theme colors from a Shiki highlighter
 */
export function extractThemeColors(highlighter: Highlighter, themeName: string): ThemeColors {
  const themeData = highlighter.getTheme(themeName as BundledTheme);
  const colors = themeData.colors || {};

  return {
    fg: themeData.fg,
    bg: themeData.bg,
    link: colors["textLink.foreground"] || colors["terminal.ansiBrightBlue"] || themeData.fg,
    red: colors["terminal.ansiBrightRed"] || colors["terminal.ansiRed"] || themeData.fg,
    orange:
      colors["notificationsWarningIcon.foreground"] ||
      colors["editorBracketHighlight.foreground2"] ||
      themeData.fg,
    yellow:
      colors["terminal.ansiBrightYellow"] || colors["editorWarning.foreground"] || themeData.fg,
    green: colors["terminal.ansiBrightGreen"] || colors["terminal.ansiGreen"] || themeData.fg,
    cyan: colors["terminal.ansiBrightCyan"] || colors["terminal.ansiCyan"] || themeData.fg,
    blue: colors["terminal.ansiBrightBlue"] || colors["terminal.ansiBlue"] || themeData.fg,
    purple: colors["terminal.ansiBrightMagenta"] || colors["terminal.ansiMagenta"] || themeData.fg,
    gray:
      colors["editorLineNumber.foreground"] || colors["terminal.ansiBrightBlack"] || themeData.fg,
    codeBg: colors["textCodeBlock.background"] || colors["editor.background"] || themeData.bg,
  };
}
