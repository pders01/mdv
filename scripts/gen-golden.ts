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
  expectedTuiPath,
  listGoldenInputs,
  readInput,
  renderGolden,
} from "../src/__tests__/golden/helper.js";
import { renderTuiSnapshot } from "../src/__tests__/golden/tui-helper.js";

const args = Bun.argv.slice(2);
const filter = args.find((a) => !a.startsWith("--"));
const skipTui = args.includes("--no-tui");
const onlyTui = args.includes("--tui-only");

mkdirSync(GOLDEN_EXPECTED_DIR, { recursive: true });

const inputs = listGoldenInputs().filter((f) => !filter || f.includes(filter));
if (inputs.length === 0) {
  console.error(`No inputs matched filter: ${filter}`);
  process.exit(1);
}

for (const name of inputs) {
  const source = readInput(name);

  if (!onlyTui) {
    const html = renderGolden(source);
    const htmlOut = expectedPath(name);
    mkdirSync(dirname(htmlOut), { recursive: true });
    writeFileSync(htmlOut, html);
    console.log(`✓ html ${name} → ${htmlOut.replace(process.cwd() + "/", "")}`);
  }

  if (!skipTui) {
    const tui = await renderTuiSnapshot(source);
    const tuiOut = expectedTuiPath(name);
    mkdirSync(dirname(tuiOut), { recursive: true });
    writeFileSync(tuiOut, tui);
    console.log(`✓ tui  ${name} → ${tuiOut.replace(process.cwd() + "/", "")}`);
  }
}

console.log(`\nWrote ${inputs.length} input${inputs.length === 1 ? "" : "s"}.`);
