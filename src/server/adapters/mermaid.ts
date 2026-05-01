/**
 * Mermaid web adapter.
 *
 * Emits <pre class="mermaid">...</pre> for ```mermaid fences. The companion
 * loader script lazy-imports a locally-served mermaid bundle only when a
 * page actually contains mermaid blocks. This means:
 *   - Pages without mermaid blocks pay zero bytes (no script runs)
 *   - The mermaid library is served from the same origin as the page
 *     (no third-party CDN, no DNS lookup, no cross-origin privacy concerns)
 *   - The same TCP/TLS connection serving the page also serves mermaid,
 *     which beats CDN cold-start latency on the rare cache miss
 *
 * The bundle itself is built once via scripts/bundle-mermaid.ts and lives
 * in src/server/assets/vendor/. The `with { type: "file" }` import lets
 * Bun resolve the path in dev and embed the file in compiled binaries.
 */

import bundlePath from "../assets/vendor/mermaid.bundle.mjs" with { type: "file" };
import type { CodeAdapter } from "./index.js";
import { escapeHtml } from "../../util/escape.js";

export interface MermaidAdapterOptions {
  /** Shiki theme name; used to pick a matching mermaid theme. */
  themeName: string;
  /**
   * When set, the loader picks the mermaid theme on the client based on
   * `prefers-color-scheme` and re-renders if the system preference flips.
   * `themeName` is ignored in dual mode.
   */
  dual?: boolean;
}

type MermaidTheme = "dark" | "default";

/**
 * Map a Shiki theme name to a mermaid theme key. Mermaid only ships a few
 * named themes, so we collapse the long tail of Shiki themes into "dark"
 * (anything mentioning "dark", "night", "dracula", etc.) or "default".
 */
function pickMermaidTheme(themeName: string): MermaidTheme {
  const lower = themeName.toLowerCase();
  if (lower.includes("light") || lower.includes("day")) return "default";
  if (
    lower.includes("dark") ||
    lower.includes("night") ||
    lower.includes("dracula") ||
    lower.includes("monokai") ||
    lower.includes("nord") ||
    lower.includes("tokyo")
  ) {
    return "dark";
  }
  return "default";
}

export const MERMAID_BUNDLE_URL = "/_static/vendor/mermaid.bundle.mjs";

/**
 * Build the loader script. In dual mode the client decides the theme via
 * `matchMedia("(prefers-color-scheme: dark)")` and re-renders on changes —
 * mermaid SVGs are static, so toggling appearance otherwise leaves stale
 * dark diagrams on a light page.
 */
function buildLoader(staticTheme: MermaidTheme | null): string {
  const initLogic = staticTheme
    ? `
    const theme = ${JSON.stringify(staticTheme)};
    mermaid.initialize({ startOnLoad: false, theme, securityLevel: "strict" });
    await mermaid.run({ querySelector: "pre.mermaid" });`
    : `
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const pickTheme = () => mq.matches ? "dark" : "default";
    // Cache original sources before first render — mermaid.run() replaces
    // the <pre>'s contents with an SVG, so re-renders need the source back.
    const blocks = Array.from(document.querySelectorAll("pre.mermaid"));
    const sources = blocks.map((el) => el.textContent);
    const render = async () => {
      mermaid.initialize({ startOnLoad: false, theme: pickTheme(), securityLevel: "strict" });
      blocks.forEach((el, i) => {
        el.removeAttribute("data-processed");
        el.textContent = sources[i] ?? "";
      });
      await mermaid.run({ nodes: blocks });
    };
    await render();
    mq.addEventListener("change", () => { render().catch((err) => console.warn("[mdv] mermaid re-render failed:", err)); });`;

  return `
<script type="module">
  if (document.querySelector("pre.mermaid")) {
    try {
      const mermaid = (await import(${JSON.stringify(MERMAID_BUNDLE_URL)})).default;${initLogic}
    } catch (err) {
      console.warn("[mdv] mermaid render failed:", err);
    }
  }
</script>`.trim();
}

export function createMermaidAdapter(opts: MermaidAdapterOptions): CodeAdapter {
  const loader = opts.dual ? buildLoader(null) : buildLoader(pickMermaidTheme(opts.themeName));

  return {
    langs: ["mermaid"],
    render(code) {
      // mermaid.run() reads textContent; angle brackets must be escaped to
      // keep the markup well-formed but mermaid will parse the source itself.
      return `<pre class="mermaid">${escapeHtml(code)}</pre>`;
    },
    bodyAssets: loader,
    staticAssets: {
      [MERMAID_BUNDLE_URL]: bundlePath,
    },
  };
}
