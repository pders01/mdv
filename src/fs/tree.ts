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
 *
 * Splits on both separators so callers can pass paths sourced from APIs
 * that disagree with `path.sep` (e.g. fs.watch on Windows under WSL,
 * git porcelain output) without silently letting an excluded segment
 * through.
 */
export function makeExclusionFilter(userExcludes: string[] = []): (relPath: string) => boolean {
  const excludeSet = new Set([...DEFAULT_EXCLUDES, ...userExcludes]);
  return (relPath) => relPath.split(/[\\/]/).some((s) => excludeSet.has(s));
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

  entries.sort((a, b) => compareTreeOrder(a.relativePath, b.relativePath));

  return { rootDir, entries };
}

// =============================================================================
// Tree shape (sidebar rendering)
// =============================================================================

export interface TreeDir {
  type: "dir";
  /** Last path segment of this directory (e.g. "opentui.com"). */
  name: string;
  children: TreeNode[];
}

export interface TreeFile {
  type: "file";
  /** Last path segment of the file (e.g. "README.md"). */
  name: string;
  entry: FileEntry;
}

export type TreeNode = TreeDir | TreeFile;

/**
 * Reshape a flat list of FileEntry into a nested tree of directories and
 * files. The input is assumed pre-sorted by `compareTreeOrder` (which is
 * what `scanDirectory` returns) — under that ordering, linear iteration
 * naturally yields children in files-before-subdirs order at each level.
 *
 * Used by both the web sidebar and the TUI sidebar, so that the tree
 * structure of the file listing is identical across modes.
 */
export function buildFileTree(entries: FileEntry[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const entry of entries) {
    const parts = entry.relativePath.split(/[\\/]/);
    let level = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const segment = parts[i]!;
      let dir = level.find((n): n is TreeDir => n.type === "dir" && n.name === segment);
      if (!dir) {
        dir = { type: "dir", name: segment, children: [] };
        level.push(dir);
      }
      level = dir.children;
    }
    level.push({ type: "file", name: parts[parts.length - 1]!, entry });
  }
  return root;
}

/**
 * Comparator that orders paths file-first within each directory level:
 *
 *   notes.md           ┐ root files come before
 *   README.md          ┘ any subdirectory contents
 *   docs/guide.md      ┐ files inside docs/ come before
 *   docs/nested/...    ┘ docs/'s subdirectories
 *   drafts/wip.md
 *
 * Within a level, names compare case-insensitively via `localeCompare`.
 *
 * The trick: at each shared segment index `i`, if A's i-th segment is its
 * last (so A is a file at this level) but B's is not (B keeps descending
 * into a subdirectory), A wins — and vice versa. Otherwise both segments
 * are the same kind and we just compare names.
 */
function compareTreeOrder(a: string, b: string): number {
  const sa = a.split(sep);
  const sb = b.split(sep);
  const shared = Math.min(sa.length, sb.length);
  for (let i = 0; i < shared; i++) {
    const aIsFile = i === sa.length - 1;
    const bIsFile = i === sb.length - 1;
    if (aIsFile !== bIsFile) return aIsFile ? -1 : 1;
    const cmp = sa[i]!.localeCompare(sb[i]!, undefined, { sensitivity: "base" });
    if (cmp !== 0) return cmp;
  }
  // One is a strict prefix of the other — shouldn't occur for unique file
  // paths, but break the tie by length so the comparator is total.
  return sa.length - sb.length;
}
