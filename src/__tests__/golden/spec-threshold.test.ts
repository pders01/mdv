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

// 639 reflects intentional conflicts with the strict spec, traded for
// real-world feature support:
// - `---\nFoo\n---` consumed by remark-frontmatter as YAML (-2)
// - `[[Page]]` consumed by remark-wiki-link as Obsidian wiki link (-3)
// - misc edges from supersub / marks / directives consuming `~`, `==`,
//   `:::` patterns the spec would tokenize differently (-2)
// All these features are far more common in actual user files than the
// edge cases they shadow.
const THRESHOLD = 639;
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
