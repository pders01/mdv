/**
 * Serialize ThemeColors to CSS custom property declarations.
 *
 * The server emits this inside a <style id="mdv-theme"> block in the page
 * head. The static app.css consumes the variables — switch theme, swap one
 * <style> block, the whole page recolors without rebuilding CSS.
 */

import type { ThemeColors } from "../types.js";

export function themeColorsToCss(colors: ThemeColors): string {
  return [
    `:root {`,
    `  --mdv-fg: ${colors.fg};`,
    `  --mdv-bg: ${colors.bg};`,
    `  --mdv-link: ${colors.link};`,
    `  --mdv-red: ${colors.red};`,
    `  --mdv-orange: ${colors.orange};`,
    `  --mdv-yellow: ${colors.yellow};`,
    `  --mdv-green: ${colors.green};`,
    `  --mdv-cyan: ${colors.cyan};`,
    `  --mdv-blue: ${colors.blue};`,
    `  --mdv-purple: ${colors.purple};`,
    `  --mdv-gray: ${colors.gray};`,
    `  --mdv-code-bg: ${colors.codeBg};`,
    `}`,
  ].join("\n");
}
