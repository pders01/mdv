/**
 * KaTeX asset wiring for the server.
 *
 * `rehype-katex` emits `<span class="katex">…</span>` markup that needs the
 * KaTeX stylesheet (and its companion font files) to render correctly. We
 * resolve the package files directly from `node_modules` and expose them
 * under `/_static/vendor/katex/`, mirroring the directory layout the CSS's
 * relative `./fonts/...` references expect.
 *
 * The mount happens server-side (no compile-time bundling step like
 * mermaid) because KaTeX ships ~60 font files; auto-discovery keeps the
 * mount in sync as the package updates.
 */

import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";

const KATEX_PUBLIC_BASE = "/_static/vendor/katex";

/** Resolves to katex's `dist/` directory inside node_modules. */
function resolveKatexDistDir(): string {
  // `katex.min.css` is a stable entry point; resolving from any file inside
  // dist/ lets us treat the parent directory as the asset root.
  const cssPath = require.resolve("katex/dist/katex.min.css");
  return dirname(cssPath);
}

/**
 * Builds the URL-path → filesystem-path map the server's static-asset
 * handler consumes. Returns an empty object if the package isn't installed
 * — math features degrade to LaTeX-as-text rather than crashing the boot.
 */
export function collectKatexStaticAssets(): Record<string, string> {
  let dist: string;
  try {
    dist = resolveKatexDistDir();
  } catch {
    return {};
  }

  const assets: Record<string, string> = {};
  assets[`${KATEX_PUBLIC_BASE}/katex.min.css`] = join(dist, "katex.min.css");

  // Fonts: every file in dist/fonts/ becomes a sibling under our public path.
  const fontsDir = join(dist, "fonts");
  try {
    for (const name of readdirSync(fontsDir)) {
      assets[`${KATEX_PUBLIC_BASE}/fonts/${name}`] = join(fontsDir, name);
    }
  } catch {
    // Missing fonts dir means KaTeX won't render glyphs but the page will
    // still load — preferable to refusing to start.
  }
  return assets;
}

/**
 * `<link>` snippet for `{{headAssets}}`. Idempotent — safe to include even
 * on pages that don't reference math; the cost is one extra stylesheet
 * request that browsers cache.
 */
export function katexHeadAssets(): string {
  return `<link rel="stylesheet" href="${KATEX_PUBLIC_BASE}/katex.min.css">`;
}
