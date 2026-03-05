import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { scanDirectory } from "../../fs/tree.js";

describe("scanDirectory", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "mdv-test-"));

    writeFileSync(join(tempDir, "README.md"), "# README");
    writeFileSync(join(tempDir, "notes.md"), "# Notes");
    writeFileSync(join(tempDir, "ignore.txt"), "not markdown");

    mkdirSync(join(tempDir, "docs"));
    writeFileSync(join(tempDir, "docs", "guide.md"), "# Guide");

    mkdirSync(join(tempDir, "docs", "nested"));
    writeFileSync(join(tempDir, "docs", "nested", "deep.md"), "# Deep");
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("finds all markdown files recursively", async () => {
    const tree = await scanDirectory(tempDir);
    expect(tree.entries).toHaveLength(4);
  });

  test("excludes non-markdown files", async () => {
    const tree = await scanDirectory(tempDir);
    const paths = tree.entries.map((e) => e.relativePath);
    expect(paths).not.toContain("ignore.txt");
  });

  test("sorts entries by relative path", async () => {
    const tree = await scanDirectory(tempDir);
    const paths = tree.entries.map((e) => e.relativePath);
    expect(paths).toEqual(["docs/guide.md", "docs/nested/deep.md", "notes.md", "README.md"]);
  });

  test("sets correct depth", async () => {
    const tree = await scanDirectory(tempDir);
    const depths = Object.fromEntries(tree.entries.map((e) => [e.relativePath, e.depth]));
    expect(depths["README.md"]).toBe(0);
    expect(depths["docs/guide.md"]).toBe(1);
    expect(depths["docs/nested/deep.md"]).toBe(2);
  });

  test("returns empty entries for directory with no markdown", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "mdv-empty-"));
    writeFileSync(join(emptyDir, "file.txt"), "not markdown");
    const tree = await scanDirectory(emptyDir);
    expect(tree.entries).toHaveLength(0);
    rmSync(emptyDir, { recursive: true, force: true });
  });
});
