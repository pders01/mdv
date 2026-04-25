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
 * Render the sidebar entry list. activeRelativePath is the file currently
 * being viewed; it gets aria-current="page".
 */
export function renderSidebar(tree: FileTree, activeRelativePath: string | null): string {
  return tree.entries
    .map((entry) => {
      const href = "/" + encodePath(entry.relativePath);
      const isActive = entry.relativePath === activeRelativePath;
      const ariaCurrent = isActive ? ` aria-current="page"` : "";
      return (
        `<a class="mdv-sidebar__entry" href="${escapeAttr(href)}"` +
        ` style="--depth: ${entry.depth}"` +
        ` data-path="${escapeAttr(entry.relativePath)}"${ariaCurrent}>` +
        `${escapeHtml(entry.relativePath)}` +
        `</a>`
      );
    })
    .join("");
}
