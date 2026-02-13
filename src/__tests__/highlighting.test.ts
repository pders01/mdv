/**
 * Highlighting module tests
 */

import { describe, test, expect, beforeAll } from "bun:test";
import {
  createHighlighterInstance,
  shikiToChunks,
  shikiLangs,
  type HighlighterInstance,
} from "../highlighting/shiki.js";
import type { ThemeColors } from "../types.js";

const defaultColors: ThemeColors = {
  fg: "#e1e4e8",
  bg: "#24292e",
  link: "#79b8ff",
  red: "#f97583",
  orange: "#ffab70",
  yellow: "#ffea7f",
  green: "#85e89d",
  cyan: "#39c5cf",
  blue: "#79b8ff",
  purple: "#b392f0",
  gray: "#6a737d",
  codeBg: "#2f363d",
};

describe("shikiLangs", () => {
  test("contains common languages", () => {
    expect(shikiLangs).toContain("typescript");
    expect(shikiLangs).toContain("javascript");
    expect(shikiLangs).toContain("python");
    expect(shikiLangs).toContain("rust");
    expect(shikiLangs).toContain("go");
  });

  test("is an array", () => {
    expect(Array.isArray(shikiLangs)).toBe(true);
  });
});

describe("createHighlighterInstance", () => {
  test("creates highlighter instance", async () => {
    const instance = await createHighlighterInstance("github-dark", defaultColors);

    expect(instance).toBeDefined();
    expect(instance.highlighter).toBeDefined();
    expect(instance.theme).toBe("github-dark");
    expect(instance.colors).toBeDefined();
  });

  test("highlighter has loaded languages", async () => {
    const instance = await createHighlighterInstance("github-dark", defaultColors);
    const loadedLangs = instance.highlighter.getLoadedLanguages();

    expect(loadedLangs).toContain("javascript");
    expect(loadedLangs).toContain("typescript");
    expect(loadedLangs).toContain("python");
  });
});

describe("shikiToChunks", () => {
  let instance: HighlighterInstance;

  beforeAll(async () => {
    instance = await createHighlighterInstance("github-dark", defaultColors);
  });

  test("returns chunks for JavaScript code", () => {
    const code = "const x = 1;";
    const chunks = shikiToChunks(instance, code, "javascript");

    expect(Array.isArray(chunks)).toBe(true);
    expect(chunks.length).toBeGreaterThan(0);
  });

  test("chunks have __isChunk marker", () => {
    const code = "let y = 2;";
    const chunks = shikiToChunks(instance, code, "javascript");

    for (const chunk of chunks) {
      expect(chunk.__isChunk).toBe(true);
    }
  });

  test("chunks have text content", () => {
    const code = "function test() {}";
    const chunks = shikiToChunks(instance, code, "javascript");

    const allText = chunks.map((c) => c.text).join("");
    expect(allText).toContain("function");
    expect(allText).toContain("test");
  });

  test("chunks have fg color", () => {
    const code = "const a = 1;";
    const chunks = shikiToChunks(instance, code, "javascript");

    // At least some chunks should have fg defined
    const hasColors = chunks.some((c) => c.fg !== undefined);
    expect(hasColors).toBe(true);
  });

  test("handles unsupported language gracefully", () => {
    const code = "some code";
    const chunks = shikiToChunks(instance, code, "unsupportedlang");

    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toBe(code);
  });

  test("handles multi-line code", () => {
    const code = "line1\nline2\nline3";
    const chunks = shikiToChunks(instance, code, "javascript");

    const allText = chunks.map((c) => c.text).join("");
    expect(allText).toContain("line1");
    expect(allText).toContain("line2");
    expect(allText).toContain("line3");
  });

  test("includes newline chunks between lines", () => {
    const code = "a\nb";
    const chunks = shikiToChunks(instance, code, "javascript");

    const hasNewline = chunks.some((c) => c.text === "\n");
    expect(hasNewline).toBe(true);
  });

  test("handles Python code", () => {
    const code = "def hello():\n    print('hi')";
    const chunks = shikiToChunks(instance, code, "python");

    expect(chunks.length).toBeGreaterThan(0);
    const allText = chunks.map((c) => c.text).join("");
    expect(allText).toContain("def");
  });
});
