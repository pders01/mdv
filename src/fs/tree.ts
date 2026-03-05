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

export async function scanDirectory(dirPath: string): Promise<FileTree> {
  const rootDir = resolve(dirPath);

  const dirEntries = await readdir(rootDir, { withFileTypes: true, recursive: true });

  const entries: FileEntry[] = [];
  for (const entry of dirEntries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

    const parentPath = entry.parentPath ?? (entry as unknown as { path: string }).path ?? rootDir;
    const fullPath = resolve(parentPath, entry.name);
    const relPath = relative(rootDir, fullPath);

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
