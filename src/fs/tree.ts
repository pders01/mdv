/**
 * Recursive directory scanner for markdown files
 */

import { readdir } from "fs/promises";
import { resolve, relative, sep } from "path";

export interface FileEntry {
  path: string;
  relativePath: string;
  depth: number;
}

export interface FileTree {
  rootDir: string;
  entries: FileEntry[];
}

const DEFAULT_EXCLUDES = [
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "vendor",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "__pycache__",
  ".venv",
  "target",
];

export interface ScanOptions {
  exclude?: string[];
}

export async function scanDirectory(dirPath: string, options?: ScanOptions): Promise<FileTree> {
  const rootDir = resolve(dirPath);
  const excludeSet = new Set([...DEFAULT_EXCLUDES, ...(options?.exclude ?? [])]);

  const dirEntries = await readdir(rootDir, { withFileTypes: true, recursive: true });

  const entries: FileEntry[] = [];
  for (const entry of dirEntries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

    const parentPath = entry.parentPath ?? (entry as unknown as { path: string }).path ?? rootDir;
    const fullPath = resolve(parentPath, entry.name);
    const relPath = relative(rootDir, fullPath);

    // Check if any path segment matches an excluded directory
    const segments = relPath.split(sep);
    if (segments.some((s) => excludeSet.has(s))) continue;

    entries.push({
      path: fullPath,
      relativePath: relPath,
      depth: segments.length - 1,
    });
  }

  entries.sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath, undefined, { sensitivity: "base" }),
  );

  return { rootDir, entries };
}
