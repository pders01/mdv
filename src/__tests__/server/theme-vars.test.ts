/**
 * Tests for the dynamic theme-vars stylesheet emission.
 *
 * These check the exact shape of the dual-mode CSS so the page contract with
 * the static app.css (which consumes `--mdv-*` and shiki dual vars) stays
 * intact.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import type { BundledTheme } from "shiki";
import { createHighlighterInstance, type HighlighterInstance } from "../../highlighting/shiki.js";
import { extractThemeColors } from "../../theme/index.js";
import { themeColorsToCss, themeColorsToCssDual } from "../../server/theme-vars.js";

let hl: HighlighterInstance;

beforeAll(async () => {
  hl = await createHighlighterInstance(["github-light", "github-dark"]);
});

describe("themeColorsToCss (single)", () => {
  test("emits a single :root block, no media queries", () => {
    const colors = extractThemeColors(hl.highlighter, "github-dark" as BundledTheme);
    const css = themeColorsToCss(colors);
    expect(css).toContain(":root {");
    expect(css).toContain("--mdv-fg:");
    expect(css).toContain("--mdv-bg:");
    expect(css).not.toContain("@media");
    expect(css).not.toContain("--shiki-light");
  });
});

describe("themeColorsToCssDual", () => {
  test("emits both light defaults and dark overrides via prefers-color-scheme", () => {
    const light = extractThemeColors(hl.highlighter, "github-light" as BundledTheme);
    const dark = extractThemeColors(hl.highlighter, "github-dark" as BundledTheme);
    const css = themeColorsToCssDual(light, dark);

    expect(css).toContain(":root {");
    expect(css).toContain("color-scheme: light dark");
    expect(css).toContain(`--mdv-fg: ${light.fg}`);
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\)/);
    expect(css).toContain(`--mdv-fg: ${dark.fg}`);
  });

  test("includes shiki dual override block so undefined-var fallbacks don't bleed in", () => {
    const light = extractThemeColors(hl.highlighter, "github-light" as BundledTheme);
    const dark = extractThemeColors(hl.highlighter, "github-dark" as BundledTheme);
    const css = themeColorsToCssDual(light, dark);

    expect(css).toContain("var(--shiki-light)");
    expect(css).toContain("var(--shiki-dark)");
    expect(css).toContain("!important");
  });

  test("light and dark colors must differ for github themes (sanity check)", () => {
    const light = extractThemeColors(hl.highlighter, "github-light" as BundledTheme);
    const dark = extractThemeColors(hl.highlighter, "github-dark" as BundledTheme);
    expect(light.fg).not.toBe(dark.fg);
    expect(light.bg).not.toBe(dark.bg);
  });
});
