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

/**
 * Build a predicate that returns true when a relative path contains an
 * excluded directory segment. The exclude set combines DEFAULT_EXCLUDES
 * with any user-provided ones so the watcher and the scanner can share
 * a single source of truth — anything filtered out of the sidebar scan
 * is also filtered out of live-reload events.
 */
export function makeExclusionFilter(userExcludes: string[] = []): (relPath: string) => boolean {
  const excludeSet = new Set([...DEFAULT_EXCLUDES, ...userExcludes]);
  return (relPath) => relPath.split(sep).some((s) => excludeSet.has(s));
}

export async function scanDirectory(dirPath: string, options?: ScanOptions): Promise<FileTree> {
  const rootDir = resolve(dirPath);
  const isExcluded = makeExclusionFilter(options?.exclude);

  const dirEntries = await readdir(rootDir, { withFileTypes: true, recursive: true });

  const entries: FileEntry[] = [];
  for (const entry of dirEntries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

    const parentPath = entry.parentPath ?? (entry as unknown as { path: string }).path ?? rootDir;
    const fullPath = resolve(parentPath, entry.name);
    const relPath = relative(rootDir, fullPath);

    if (isExcluded(relPath)) continue;

    entries.push({
      path: fullPath,
      relativePath: relPath,
      depth: relPath.split(sep).length - 1,
    });
  }

  entries.sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath, undefined, { sensitivity: "base" }),
  );

  return { rootDir, entries };
}
