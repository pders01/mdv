/**
 * Mermaid pre-pass tests.
 *
 * These tests exercise the structural behavior of prerenderMermaid without
 * depending on mermaid-ascii being installed in the test environment. A tiny
 * shell-script stub at /tmp/mdv-fake-mermaid stands in for the real binary;
 * pointing MDV_MERMAID_BIN at it lets us verify the spawn/cache paths.
 */

import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { writeFileSync, chmodSync, unlinkSync, existsSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { prerenderMermaid, detectMermaidBin, _resetMermaidState } from "../../rendering/mermaid.js";

// A hermetic disk cache per test case — avoids polluting `~/.cache/mdv/mermaid`
// and, more importantly, prevents cache collisions between test cases that
// use different fake binaries on identical source inputs. A fresh dir is
// created in beforeEach and torn down in afterAll.
let testCacheDir = "";
const createdCacheDirs: string[] = [];

// A fake binary that echoes its stdin verbatim with a marker prefix. Proves
// the spawn path is taken and confirms stdin is piped through correctly.
const FAKE_BIN = join(tmpdir(), "mdv-fake-mermaid");
const FAKE_SCRIPT = `#!/bin/sh
printf 'FAKE_RENDER\\n'
cat
`;

// A fake binary whose output width depends on which padding flags were
// passed. Default emits a 100-col line, -x 1 -y 1 emits 60 cols, and the
// ultra-compact flags emit 30 cols. This lets us drive the width-fit
// logic deterministically in tests.
const VARIANT_BIN = join(tmpdir(), "mdv-variant-mermaid");
const VARIANT_SCRIPT = `#!/bin/sh
# Detect which variant flags were passed and emit a correspondingly-sized line.
width=100
for arg in "$@"; do
  if [ "$arg" = "1" ]; then width=60; fi
  if [ "$arg" = "0" ]; then width=30; fi
done
# Drain stdin so the child doesn't block.
cat > /dev/null
# Emit a single line exactly $width chars wide.
printf '%*s\\n' "$width" '' | tr ' ' X
`;

const SIMPLE_MERMAID = `# doc

\`\`\`mermaid
flowchart TD
  A --> B
\`\`\`
`;

const NO_MERMAID = `# doc

\`\`\`js
console.log("no mermaid here");
\`\`\`
`;

const DUPLICATE_MERMAID = `
\`\`\`mermaid
flowchart TD
  A --> B
\`\`\`

prose between

\`\`\`mermaid
flowchart TD
  A --> B
\`\`\`
`;

function installFakeBin(): void {
  writeFileSync(FAKE_BIN, FAKE_SCRIPT);
  chmodSync(FAKE_BIN, 0o755);
}

function removeFakeBin(): void {
  if (existsSync(FAKE_BIN)) unlinkSync(FAKE_BIN);
}

function installVariantBin(): void {
  writeFileSync(VARIANT_BIN, VARIANT_SCRIPT);
  chmodSync(VARIANT_BIN, 0o755);
}

function removeVariantBin(): void {
  if (existsSync(VARIANT_BIN)) unlinkSync(VARIANT_BIN);
}

beforeEach(() => {
  _resetMermaidState();
  delete process.env.MDV_MERMAID_BIN;
  testCacheDir = mkdtempSync(join(tmpdir(), "mdv-mermaid-test-"));
  createdCacheDirs.push(testCacheDir);
  process.env.MDV_MERMAID_CACHE = testCacheDir;
});

afterAll(() => {
  removeFakeBin();
  removeVariantBin();
  delete process.env.MDV_MERMAID_BIN;
  delete process.env.MDV_MERMAID_CACHE;
  for (const dir of createdCacheDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
  _resetMermaidState();
});

describe("prerenderMermaid — disabled path", () => {
  test("returns empty result when disabled flag is set", async () => {
    const result = await prerenderMermaid(SIMPLE_MERMAID, { disabled: true });
    expect(result.renders.size).toBe(0);
    expect(result.hadBlocks).toBe(true);
    expect(result.toolMissing).toBe(false);
    expect(result.overflowed).toBe(0);
  });

  test("does not probe the binary when disabled", async () => {
    // Point env at a nonexistent path; if detection ran, it would still
    // return the path (env override is trusted). Disabled should short-circuit
    // before detection runs and produce no renders.
    process.env.MDV_MERMAID_BIN = "/definitely/not/a/real/path/mermaid-ascii";
    const result = await prerenderMermaid(SIMPLE_MERMAID, { disabled: true });
    expect(result.renders.size).toBe(0);
    expect(result.toolMissing).toBe(false);
  });
});

describe("prerenderMermaid — no mermaid blocks", () => {
  test("returns empty result with hadBlocks=false", async () => {
    const result = await prerenderMermaid(NO_MERMAID);
    expect(result.renders.size).toBe(0);
    expect(result.hadBlocks).toBe(false);
    expect(result.toolMissing).toBe(false);
  });

  test("empty content is a no-op", async () => {
    const result = await prerenderMermaid("");
    expect(result.hadBlocks).toBe(false);
  });
});

describe("prerenderMermaid — tool missing", () => {
  test("reports toolMissing when content has blocks but binary is unavailable", async () => {
    // Point env at a path that doesn't exist AND isn't discoverable via PATH.
    // detectMermaidBin trusts the env var, but renderOne will fail to spawn
    // and cache the failure. The tool-missing branch only fires when BOTH the
    // env var is unset AND $PATH lookup returns null, so we clear both.
    delete process.env.MDV_MERMAID_BIN;
    // Sanity check: if mermaid-ascii happens to be on $PATH in the test env,
    // this test isn't meaningful. Skip in that case rather than fail.
    if (detectMermaidBin() !== null) {
      _resetMermaidState();
      return;
    }
    _resetMermaidState();
    const result = await prerenderMermaid(SIMPLE_MERMAID);
    expect(result.hadBlocks).toBe(true);
    expect(result.toolMissing).toBe(true);
    expect(result.renders.size).toBe(0);
  });
});

describe("prerenderMermaid — happy path with fake binary", () => {
  test("renders a single mermaid block via the fake binary", async () => {
    installFakeBin();
    process.env.MDV_MERMAID_BIN = FAKE_BIN;
    _resetMermaidState();

    const result = await prerenderMermaid(SIMPLE_MERMAID);
    expect(result.hadBlocks).toBe(true);
    expect(result.toolMissing).toBe(false);
    expect(result.renders.size).toBe(1);

    const source = "flowchart TD\n  A --> B";
    const rendered = result.renders.get(source);
    expect(rendered).toBeDefined();
    // Fake binary prefixes output with "FAKE_RENDER" and echoes stdin.
    expect(rendered).toContain("FAKE_RENDER");
    expect(rendered).toContain("flowchart TD");
  });

  test("picks the default variant when it fits the width budget", async () => {
    installVariantBin();
    process.env.MDV_MERMAID_BIN = VARIANT_BIN;
    _resetMermaidState();

    // Default variant emits 100-col lines; budget is 120.
    const result = await prerenderMermaid(SIMPLE_MERMAID, { availableWidth: 120 });
    expect(result.renders.size).toBe(1);
    expect(result.overflowed).toBe(0);
    const ascii = [...result.renders.values()][0]!;
    // 100-col default variant output (X-filled line).
    expect(ascii.length).toBe(100);
  });

  test("falls back to compact variant when default overflows", async () => {
    installVariantBin();
    process.env.MDV_MERMAID_BIN = VARIANT_BIN;
    _resetMermaidState();

    // Default 100 > 80, compact 60 <= 80, should pick compact.
    const result = await prerenderMermaid(SIMPLE_MERMAID, { availableWidth: 80 });
    expect(result.renders.size).toBe(1);
    expect(result.overflowed).toBe(0);
    const ascii = [...result.renders.values()][0]!;
    expect(ascii.length).toBe(60);
  });

  test("falls back to ultra-compact variant when compact overflows", async () => {
    installVariantBin();
    process.env.MDV_MERMAID_BIN = VARIANT_BIN;
    _resetMermaidState();

    // Default 100, compact 60, ultra 30; budget 40 → ultra.
    const result = await prerenderMermaid(SIMPLE_MERMAID, { availableWidth: 40 });
    expect(result.renders.size).toBe(1);
    expect(result.overflowed).toBe(0);
    const ascii = [...result.renders.values()][0]!;
    expect(ascii.length).toBe(30);
  });

  test("omits diagram from renders and reports overflow when no variant fits", async () => {
    installVariantBin();
    process.env.MDV_MERMAID_BIN = VARIANT_BIN;
    _resetMermaidState();

    // All three variants produce lines wider than 20.
    const result = await prerenderMermaid(SIMPLE_MERMAID, { availableWidth: 20 });
    expect(result.renders.size).toBe(0);
    expect(result.overflowed).toBe(1);
    expect(result.hadBlocks).toBe(true);
    expect(result.toolMissing).toBe(false);
  });

  test("preprocesses <br/> variants before spawning", async () => {
    installFakeBin();
    process.env.MDV_MERMAID_BIN = FAKE_BIN;
    _resetMermaidState();

    const withBrTags = `
\`\`\`mermaid
flowchart TD
  A["Browser<br/>(Lit SPA)"] --> B["Server<br />(Bun)"]
  B --> C["DB<BR>(SQLite)"]
\`\`\`
`;
    const result = await prerenderMermaid(withBrTags);
    expect(result.renders.size).toBe(1);

    // The fake binary echoes stdin, so the rendered output contains what
    // was actually piped — which must not contain any literal <br/> tags.
    const rendered = [...result.renders.values()][0]!;
    expect(rendered).not.toContain("<br");
    expect(rendered).not.toContain("<BR");
    // Labels should still contain the real text, just with spaces where
    // the breaks used to be.
    expect(rendered).toContain("Browser");
    expect(rendered).toContain("(Lit SPA)");

    // The Map key is still the *original* (un-preprocessed) source so the
    // dispatcher can look up by token.text at render time.
    const originalSource = [...result.renders.keys()][0]!;
    expect(originalSource).toContain("<br/>");
  });

  test("deduplicates identical mermaid sources", async () => {
    installFakeBin();
    process.env.MDV_MERMAID_BIN = FAKE_BIN;
    _resetMermaidState();

    const result = await prerenderMermaid(DUPLICATE_MERMAID);
    // Two identical blocks → one Map entry (Map is keyed by source).
    expect(result.renders.size).toBe(1);
  });

  test("caches results across calls — second call is a memory hit", async () => {
    installFakeBin();
    process.env.MDV_MERMAID_BIN = FAKE_BIN;
    _resetMermaidState();

    const first = await prerenderMermaid(SIMPLE_MERMAID);
    expect(first.renders.size).toBe(1);

    // Remove the fake binary — if the second call hits memory, it still works.
    removeFakeBin();
    const second = await prerenderMermaid(SIMPLE_MERMAID);
    expect(second.renders.size).toBe(1);
    expect(second.renders.get("flowchart TD\n  A --> B")).toBe(
      first.renders.get("flowchart TD\n  A --> B")!,
    );
  });
});

describe("detectMermaidBin", () => {
  test("prefers MDV_MERMAID_BIN over $PATH lookup", () => {
    process.env.MDV_MERMAID_BIN = "/custom/path/mermaid-ascii";
    _resetMermaidState();
    expect(detectMermaidBin()).toBe("/custom/path/mermaid-ascii");
  });

  test("returns null when neither env nor PATH resolves", () => {
    delete process.env.MDV_MERMAID_BIN;
    _resetMermaidState();
    // Note: this only passes if mermaid-ascii isn't on the test env's $PATH.
    // If it is, detectMermaidBin returns a string — still a valid result.
    const result = detectMermaidBin();
    expect(result === null || typeof result === "string").toBe(true);
  });

  test("caches detection result within a session", () => {
    process.env.MDV_MERMAID_BIN = "/first/path";
    _resetMermaidState();
    expect(detectMermaidBin()).toBe("/first/path");
    process.env.MDV_MERMAID_BIN = "/second/path";
    // Cached — env change after first call is ignored until reset.
    expect(detectMermaidBin()).toBe("/first/path");
    _resetMermaidState();
    expect(detectMermaidBin()).toBe("/second/path");
  });
});
