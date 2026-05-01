/**
 * Lazy fence-language detection and on-demand loading.
 */

import { describe, test, expect } from "bun:test";
import {
  createHighlighterInstance,
  detectFenceLangs,
  loadLangsForContent,
} from "../highlighting/shiki.js";

describe("detectFenceLangs", () => {
  test("returns canonical names for known fence langs", () => {
    const md = "```ts\nconst x = 1;\n```\n\n```python\nx = 1\n```";
    const langs = detectFenceLangs(md);
    expect(new Set(langs)).toEqual(new Set(["typescript", "python"]));
  });

  test("filters unknown languages", () => {
    const md = "```text\nhi\n```\n\n```output\nlogs\n```\n\n```bash\necho\n```";
    expect(detectFenceLangs(md)).toEqual(["bash"]);
  });

  test("dedupes repeated langs", () => {
    const md = "```ts\n1\n```\n```ts\n2\n```\n```ts\n3\n```";
    expect(detectFenceLangs(md)).toEqual(["typescript"]);
  });

  test("handles tilde fences and indented fences", () => {
    const md = "  ```rust\nfn x(){}\n```\n\n~~~go\npackage main\n~~~";
    expect(new Set(detectFenceLangs(md))).toEqual(new Set(["rust", "go"]));
  });

  test("returns empty for content with no fences", () => {
    expect(detectFenceLangs("# Just text\n\nA paragraph.")).toEqual([]);
  });
});

describe("loadLangsForContent", () => {
  test("loads only languages referenced by content", async () => {
    const hl = await createHighlighterInstance("github-dark");
    expect(hl.highlighter.getLoadedLanguages()).toEqual([]);

    await loadLangsForContent(hl, "```ts\nconst x = 1;\n```");
    const loaded = new Set(hl.highlighter.getLoadedLanguages());
    expect(loaded.has("typescript")).toBe(true);
    expect(loaded.has("python")).toBe(false);
  });

  test("is a no-op when every fence lang is already loaded", async () => {
    const hl = await createHighlighterInstance("github-dark");
    await loadLangsForContent(hl, "```ts\n1\n```");
    const before = hl.highlighter.getLoadedLanguages().length;

    // Same content; second pass must not grow the loaded set.
    await loadLangsForContent(hl, "```ts\n1\n```");
    expect(hl.highlighter.getLoadedLanguages().length).toBe(before);
  });

  test("only loads new langs on subsequent calls", async () => {
    const hl = await createHighlighterInstance("github-dark");
    await loadLangsForContent(hl, "```ts\n1\n```");
    expect(hl.highlighter.getLoadedLanguages()).toContain("typescript");
    expect(hl.highlighter.getLoadedLanguages()).not.toContain("python");

    await loadLangsForContent(hl, "```python\nx=1\n```");
    expect(hl.highlighter.getLoadedLanguages()).toContain("python");
    expect(hl.highlighter.getLoadedLanguages()).toContain("typescript");
  });
});
