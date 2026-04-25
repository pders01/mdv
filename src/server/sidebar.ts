/**
 * Server-side sidebar rendering. Reuses scanDirectory so exclude rules and
 * sort order are identical to the TUI sidebar.
 */

import type { FileTree } from "../fs/tree.js";
import { escapeAttr, escapeHtml } from "../util/escape.js";

/**
 * Encode a path for use in a URL while preserving / separators so each
 * segment renders as its own path component in the address bar.
 */
function encodePath(p: string): string {
  return p
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

/**
 * Split a relative path into a directory prefix (everything up to and
 * including the last separator) and a basename (the filename). Files at
 * the root return an empty prefix. Accepts either separator so paths
 * sourced from APIs with mixed conventions still split.
 */
function splitPath(relPath: string): { dir: string; name: string } {
  const idx = Math.max(relPath.lastIndexOf("/"), relPath.lastIndexOf("\\"));
  if (idx === -1) return { dir: "", name: relPath };
  return { dir: relPath.slice(0, idx + 1), name: relPath.slice(idx + 1) };
}

/**
 * Render the sidebar entry list. activeRelativePath is the file currently
 * being viewed; it gets aria-current="page". Entries display the basename
 * prominently with the directory prefix dimmed via CSS opacity, so the
 * filename is the visual focal point and the path serves as quiet
 * disambiguation context.
 */
export function renderSidebar(tree: FileTree, activeRelativePath: string | null): string {
  return tree.entries
    .map((entry) => {
      const href = "/" + encodePath(entry.relativePath);
      const isActive = entry.relativePath === activeRelativePath;
      const ariaCurrent = isActive ? ` aria-current="page"` : "";
      const { dir, name } = splitPath(entry.relativePath);
      const label = dir
        ? `<span class="mdv-sidebar__entry-dir">${escapeHtml(dir)}</span>${escapeHtml(name)}`
        : escapeHtml(name);
      return (
        `<a class="mdv-sidebar__entry" href="${escapeAttr(href)}"` +
        ` style="--depth: ${entry.depth}"` +
        ` data-path="${escapeAttr(entry.relativePath)}"${ariaCurrent}>` +
        label +
        `</a>`
      );
    })
    .join("");
}
