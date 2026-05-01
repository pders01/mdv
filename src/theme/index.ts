/**
 * Theme module exports
 */

export { extractThemeColors } from "./colors.js";
export { createSyntaxStyle } from "./syntax.js";
export {
  detectSystemAppearance,
  resolveTheme,
  resolveThemeSpec,
  type Appearance,
  type ThemeSpec,
} from "./system.js";
