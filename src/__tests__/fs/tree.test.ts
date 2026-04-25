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

    // Directories that should be excluded by default
    mkdirSync(join(tempDir, "node_modules"));
    writeFileSync(join(tempDir, "node_modules", "pkg.md"), "# Pkg");

    mkdirSync(join(tempDir, ".git"));
    writeFileSync(join(tempDir, ".git", "info.md"), "# Git");

    mkdirSync(join(tempDir, "vendor"));
    writeFileSync(join(tempDir, "vendor", "lib.md"), "# Vendor");

    // Custom directory for exclusion testing
    mkdirSync(join(tempDir, "drafts"));
    writeFileSync(join(tempDir, "drafts", "wip.md"), "# WIP");
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("finds all markdown files recursively (excluding defaults)", async () => {
    const tree = await scanDirectory(tempDir);
    expect(tree.entries).toHaveLength(5); // README, notes, docs/guide, docs/nested/deep, drafts/wip
  });

  test("excludes non-markdown files", async () => {
    const tree = await scanDirectory(tempDir);
    const paths = tree.entries.map((e) => e.relativePath);
    expect(paths).not.toContain("ignore.txt");
  });

  test("excludes node_modules by default", async () => {
    const tree = await scanDirectory(tempDir);
    const paths = tree.entries.map((e) => e.relativePath);
    expect(paths.some((p) => p.includes("node_modules"))).toBe(false);
  });

  test("excludes .git by default", async () => {
    const tree = await scanDirectory(tempDir);
    const paths = tree.entries.map((e) => e.relativePath);
    expect(paths.some((p) => p.includes(".git"))).toBe(false);
  });

  test("excludes vendor by default", async () => {
    const tree = await scanDirectory(tempDir);
    const paths = tree.entries.map((e) => e.relativePath);
    expect(paths.some((p) => p.includes("vendor"))).toBe(false);
  });

  test("excludes custom directories via options", async () => {
    const tree = await scanDirectory(tempDir, { exclude: ["drafts"] });
    const paths = tree.entries.map((e) => e.relativePath);
    expect(paths.some((p) => p.includes("drafts"))).toBe(false);
    expect(tree.entries).toHaveLength(4); // README, notes, docs/guide, docs/nested/deep
  });

  test("orders files before subdirectory contents at each level", async () => {
    const tree = await scanDirectory(tempDir);
    const paths = tree.entries.map((e) => e.relativePath);
    // Root-level files (notes.md, README.md) come before any subdir content,
    // then within docs/ the file (guide.md) comes before nested/. Names
    // within a level are case-insensitive alphabetical.
    expect(paths).toEqual([
      "notes.md",
      "README.md",
      "docs/guide.md",
      "docs/nested/deep.md",
      "drafts/wip.md",
    ]);
  });

  test("file-vs-subdir grouping holds at every depth", async () => {
    const tree = await scanDirectory(tempDir);
    const idx = (p: string) => tree.entries.findIndex((e) => e.relativePath === p);

    // Root files before root subdirs
    expect(idx("notes.md")).toBeLessThan(idx("docs/guide.md"));
    expect(idx("README.md")).toBeLessThan(idx("drafts/wip.md"));
    // docs/ file before docs/nested/
    expect(idx("docs/guide.md")).toBeLessThan(idx("docs/nested/deep.md"));
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
