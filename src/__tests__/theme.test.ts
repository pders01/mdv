/**
 * Theme module tests
 */

import { describe, test, expect } from "bun:test";
import { createHighlighter, type Highlighter } from "shiki";
import { extractThemeColors } from "../theme/colors.js";

describe("extractThemeColors", () => {
  let highlighter: Highlighter;

  // Create highlighter once for all tests
  beforeAll(async () => {
    highlighter = await createHighlighter({
      themes: ["github-dark", "nord"],
      langs: ["javascript"],
    });
  });

  test("extracts colors from github-dark theme", () => {
    const colors = extractThemeColors(highlighter, "github-dark");

    expect(colors.fg).toBeDefined();
    expect(colors.bg).toBeDefined();
    expect(typeof colors.fg).toBe("string");
    expect(typeof colors.bg).toBe("string");
  });

  test("extracts all color properties", () => {
    const colors = extractThemeColors(highlighter, "github-dark");

    expect(colors).toHaveProperty("fg");
    expect(colors).toHaveProperty("bg");
    expect(colors).toHaveProperty("link");
    expect(colors).toHaveProperty("red");
    expect(colors).toHaveProperty("orange");
    expect(colors).toHaveProperty("yellow");
    expect(colors).toHaveProperty("green");
    expect(colors).toHaveProperty("cyan");
    expect(colors).toHaveProperty("blue");
    expect(colors).toHaveProperty("purple");
    expect(colors).toHaveProperty("gray");
    expect(colors).toHaveProperty("codeBg");
  });

  test("colors are valid hex strings", () => {
    const colors = extractThemeColors(highlighter, "github-dark");

    // All colors should be hex color strings
    expect(colors.fg).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(colors.bg).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  test("extracts colors from different theme", () => {
    const colors = extractThemeColors(highlighter, "nord");

    expect(colors.fg).toBeDefined();
    expect(colors.bg).toBeDefined();
    expect(typeof colors.fg).toBe("string");
  });

  test("github-dark has expected dark background", () => {
    const colors = extractThemeColors(highlighter, "github-dark");

    // GitHub dark should have a dark background
    const bgNum = parseInt(colors.bg.slice(1), 16);
    // Dark backgrounds have lower RGB values
    expect(bgNum).toBeLessThan(0x808080);
  });
});

// Import afterAll just for the hook
import { beforeAll } from "bun:test";
