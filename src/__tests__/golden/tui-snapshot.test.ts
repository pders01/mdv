/**
 * TUI golden snapshots — regression net for terminal rendering.
 *
 * Each `inputs/*.md` is rendered through the production TUI pipeline at a
 * fixed 80×40 viewport (see `tui-helper.ts`) and the captured char buffer
 * is compared to its `expected/*.expected.tui.txt` sibling.
 *
 * Catches what the HTML snapshot can't: column wrap, list-bullet glyphs,
 * conceal behavior, blockquote indentation, scrollbar placement, table
 * width math.
 *
 * Update workflow same as HTML: `bun run regen-golden`, review diff.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { listGoldenInputs, readExpectedTui, readInput } from "./helper.js";
import { getSharedHighlighter, renderTuiSnapshot } from "./tui-helper.js";

describe("golden TUI snapshots", () => {
  // Warm the shared highlighter once so individual tests don't pay the
  // ~150ms Shiki cold-start each.
  beforeAll(async () => {
    await getSharedHighlighter();
  });

  for (const name of listGoldenInputs()) {
    test(name, async () => {
      const actual = await renderTuiSnapshot(readInput(name));
      const expected = readExpectedTui(name);
      expect(actual).toBe(expected);
    });
  }

  test("shows wide header-only tables and wraps single-column values", async () => {
    const heading = "FirstHeading".repeat(8);
    const value = "x".repeat(90);
    const frame = await renderTuiSnapshot(
      `| ${heading} | Second heading |\n|---|---|\n\n| Header |\n|---|\n| ${value} |\n`,
    );
    const compact = frame.replace(/\s/g, "");
    expect(compact).toContain(heading);
    expect(compact).toContain(`Header:${value}`);
    expect(frame).not.toContain("…");
  });

  test("keeps times and both kinds of digest suffixes in prose and tables", async () => {
    const frame = await renderTuiSnapshot(
      "09:42 UTC sha256:deadbeef release:stable\n\n| When | Hash |\n|---|---|\n| 09:42 | sha256:8c20 |\n",
    );
    expect(frame).toContain("09:42 UTC sha256:deadbeef release:stable");
    expect(frame).toContain("09:42  | sha256:8c20");
  });
});
