/**
 * CommonMark spec conformance gate.
 *
 * Locks in the current pass count so any future change that regresses
 * conformance is caught immediately. The bench engine itself is exercised
 * by `bun run bench:commonmark`; this test only enforces the floor.
 *
 * The threshold is set just below the current measured value so legitimate
 * normalizer tightening doesn't trigger flakes — bump it deliberately when
 * a fix lands. Migrating the parser (e.g. to micromark) is expected to
 * push the floor much higher; raise THRESHOLD in the same commit.
 */

import { test, expect } from "bun:test";
import { runBench } from "../../../scripts/lib/commonmark-bench.js";

// 644 reflects two intentional conflicts with the strict spec:
// - `---\nFoo\n---\nBar\n---` and `---\n---` get consumed by
//   `remark-frontmatter` as YAML frontmatter even though the spec parses
//   them as thematic breaks + setext heading. Frontmatter at doc-start is
//   far more common in real-world markdown (Obsidian, Hugo, Jekyll), so
//   the trade-off is the right one.
const THRESHOLD = 644;
const TOTAL = 652;

test(
  `CommonMark 0.31.2 conformance — at least ${THRESHOLD}/${TOTAL} pass`,
  async () => {
    const summary = await runBench();
    expect(summary.total).toBe(TOTAL);
    expect(summary.pass).toBeGreaterThanOrEqual(THRESHOLD);
  },
  { timeout: 30_000 },
);
