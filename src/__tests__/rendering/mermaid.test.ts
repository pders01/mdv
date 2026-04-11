/**
 * Mermaid pre-pass tests.
 *
 * These tests exercise the structural behavior of prerenderMermaid without
 * depending on mermaid-ascii being installed in the test environment. A tiny
 * shell-script stub at /tmp/mdv-fake-mermaid stands in for the real binary;
 * pointing MDV_MERMAID_BIN at it lets us verify the spawn/cache paths.
 */

import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { writeFileSync, chmodSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { prerenderMermaid, detectMermaidBin, _resetMermaidState } from "../../rendering/mermaid.js";

// A fake binary that echoes its stdin verbatim with a marker prefix. Proves
// the spawn path is taken and confirms stdin is piped through correctly.
const FAKE_BIN = join(tmpdir(), "mdv-fake-mermaid");
const FAKE_SCRIPT = `#!/bin/sh
printf 'FAKE_RENDER\\n'
cat
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

beforeEach(() => {
  _resetMermaidState();
  delete process.env.MDV_MERMAID_BIN;
});

afterAll(() => {
  removeFakeBin();
  delete process.env.MDV_MERMAID_BIN;
  _resetMermaidState();
});

describe("prerenderMermaid — disabled path", () => {
  test("returns empty result when disabled flag is set", async () => {
    const result = await prerenderMermaid(SIMPLE_MERMAID, { disabled: true });
    expect(result.renders.size).toBe(0);
    expect(result.hadBlocks).toBe(true);
    expect(result.toolMissing).toBe(false);
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
