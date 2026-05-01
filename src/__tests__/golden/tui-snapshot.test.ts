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
import {
  listGoldenInputs,
  readExpectedTui,
  readInput,
} from "./helper.js";
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
});
