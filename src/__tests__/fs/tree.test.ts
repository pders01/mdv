import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { buildFileTree, scanDirectory, type FileEntry, type TreeDir } from "../../fs/tree.js";

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

describe("buildFileTree", () => {
  function file(rel: string): FileEntry {
    return {
      path: "/abs/" + rel,
      relativePath: rel,
      depth: rel.split("/").length - 1,
    };
  }

  test("nests files under their parent directories", () => {
    const out = buildFileTree([
      file("README.md"),
      file("docs/guide.md"),
      file("docs/nested/deep.md"),
    ]);
    // Top level: README.md (file), then docs/ (dir)
    expect(out).toHaveLength(2);
    expect(out[0]!.type).toBe("file");
    expect(out[0]!.name).toBe("README.md");
    expect(out[1]!.type).toBe("dir");
    expect(out[1]!.name).toBe("docs");

    // docs/: guide.md (file), then nested/ (dir)
    const docs = out[1] as TreeDir;
    expect(docs.children).toHaveLength(2);
    expect(docs.children[0]!.name).toBe("guide.md");
    expect(docs.children[1]!.name).toBe("nested");

    // docs/nested/: deep.md
    const nested = docs.children[1] as TreeDir;
    expect(nested.children).toHaveLength(1);
    expect(nested.children[0]!.name).toBe("deep.md");
  });

  test("preserves the input order within each directory", () => {
    // Input is already in compareTreeOrder (files first, then subdirs).
    const out = buildFileTree([file("a.md"), file("b.md"), file("z/c.md")]);
    expect(out.map((n) => n.name)).toEqual(["a.md", "b.md", "z"]);
  });

  test("handles a single root file", () => {
    const out = buildFileTree([file("README.md")]);
    expect(out).toEqual([
      { type: "file", name: "README.md", entry: file("README.md") },
    ]);
  });

  test("handles deeply nested paths without intermediate files", () => {
    const out = buildFileTree([file("a/b/c/d.md")]);
    expect(out).toHaveLength(1);
    let cur = out[0] as TreeDir;
    expect(cur.name).toBe("a");
    cur = cur.children[0] as TreeDir;
    expect(cur.name).toBe("b");
    cur = cur.children[0] as TreeDir;
    expect(cur.name).toBe("c");
    expect(cur.children[0]!.name).toBe("d.md");
    expect(cur.children[0]!.type).toBe("file");
  });
});
