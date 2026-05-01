/**
 * Serialize ThemeColors to CSS custom property declarations.
 *
 * The server emits this inside a <style id="mdv-theme"> block in the page
 * head. The static app.css consumes the variables — switch theme, swap one
 * <style> block, the whole page recolors without rebuilding CSS.
 *
 * In dual mode (`auto`), light vars live at `:root` and dark vars override
 * inside `@media (prefers-color-scheme: dark)`, so the browser picks a
 * variant per viewer instead of inheriting the host OS appearance.
 */

import type { ThemeColors } from "../types.js";

function declarations(colors: ThemeColors): string[] {
  return [
    `--mdv-fg: ${colors.fg};`,
    `--mdv-bg: ${colors.bg};`,
    `--mdv-link: ${colors.link};`,
    `--mdv-red: ${colors.red};`,
    `--mdv-orange: ${colors.orange};`,
    `--mdv-yellow: ${colors.yellow};`,
    `--mdv-green: ${colors.green};`,
    `--mdv-cyan: ${colors.cyan};`,
    `--mdv-blue: ${colors.blue};`,
    `--mdv-purple: ${colors.purple};`,
    `--mdv-gray: ${colors.gray};`,
    `--mdv-code-bg: ${colors.codeBg};`,
  ];
}

export function themeColorsToCss(colors: ThemeColors): string {
  return [`:root {`, ...declarations(colors).map((l) => `  ${l}`), `}`].join("\n");
}

export function themeColorsToCssDual(light: ThemeColors, dark: ThemeColors): string {
  // The Shiki override block lives here (not app.css) so it only ships in
  // dual mode. Single-theme renders use plain inline `style="color:..."`
  // attributes — referencing undefined `--shiki-*` vars there would
  // invalidate the declarations and erase code-block colors.
  return [
    `:root {`,
    `  color-scheme: light dark;`,
    ...declarations(light).map((l) => `  ${l}`),
    `}`,
    `@media (prefers-color-scheme: dark) {`,
    `  :root {`,
    ...declarations(dark).map((l) => `    ${l}`),
    `  }`,
    `}`,
    `.shiki,`,
    `.shiki span {`,
    `  color: var(--shiki-light) !important;`,
    `  background-color: var(--shiki-light-bg) !important;`,
    `  font-style: var(--shiki-light-font-style) !important;`,
    `  font-weight: var(--shiki-light-font-weight) !important;`,
    `  text-decoration: var(--shiki-light-text-decoration) !important;`,
    `}`,
    `@media (prefers-color-scheme: dark) {`,
    `  .shiki,`,
    `  .shiki span {`,
    `    color: var(--shiki-dark) !important;`,
    `    background-color: var(--shiki-dark-bg) !important;`,
    `    font-style: var(--shiki-dark-font-style) !important;`,
    `    font-weight: var(--shiki-dark-font-weight) !important;`,
    `    text-decoration: var(--shiki-dark-text-decoration) !important;`,
    `  }`,
    `}`,
  ].join("\n");
}
