#!/usr/bin/env bun
/**
 * Regenerate golden HTML snapshots.
 *
 * Reads every `.md` in `src/__tests__/golden/inputs/`, renders via the
 * deterministic golden registry (no Shiki/Mermaid), and writes
 * `.expected.html` siblings into `src/__tests__/golden/expected/`.
 *
 * Run after intentional renderer changes — review the diff, commit if
 * acceptable. The test in `src/__tests__/golden/snapshot.test.ts` reads the
 * same files and fails on any mismatch.
 *
 * Usage:
 *   bun run scripts/gen-golden.ts            # regenerate all
 *   bun run scripts/gen-golden.ts 03-lists   # regenerate one input
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  GOLDEN_EXPECTED_DIR,
  expectedPath,
  listGoldenInputs,
  readInput,
  renderGolden,
} from "../src/__tests__/golden/helper.js";

const filter = Bun.argv[2];

mkdirSync(GOLDEN_EXPECTED_DIR, { recursive: true });

const inputs = listGoldenInputs().filter((f) => !filter || f.includes(filter));
if (inputs.length === 0) {
  console.error(`No inputs matched filter: ${filter}`);
  process.exit(1);
}

for (const name of inputs) {
  const source = readInput(name);
  const html = renderGolden(source);
  const out = expectedPath(name);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(`✓ ${name} → ${out.replace(process.cwd() + "/", "")}`);
}

console.log(`\nWrote ${inputs.length} snapshot${inputs.length === 1 ? "" : "s"}.`);
