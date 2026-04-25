/**
 * Server-side sidebar rendering.
 *
 * Emits a WAI-ARIA tree structure (role="tree" + role="group" + role="treeitem")
 * so the hierarchy is screen-reader-navigable, indent comes from the natural
 * nesting of the markup, and the per-row label only needs to show the basename
 * — saving the horizontal space full paths used to take.
 *
 * Each leaf gets a stable id so the client can drive sidebar cursor state via
 * `aria-activedescendant` without moving real focus per row (which would let
 * Tab step through every entry — wrong shape).
 */

import { buildFileTree, type FileTree, type TreeNode } from "../fs/tree.js";
import { escapeAttr, escapeHtml } from "../util/escape.js";

const ENTRY_ID_PREFIX = "mdv-entry-";

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
 * Render the sidebar entry list as a nested tree.
 *
 * `activeRelativePath` is the file currently being viewed; the corresponding
 * leaf gets `aria-current="page"`. Directory branches are always expanded for
 * now (no collapse interaction yet); the markup is ready for it via the
 * `aria-expanded` attribute.
 */
export function renderSidebar(tree: FileTree, activeRelativePath: string | null): string {
  const nodes = buildFileTree(tree.entries);
  // Pre-walk to assign stable leaf ids in source order. The client uses
  // these for aria-activedescendant — keeping ids stable across re-renders
  // would also let us preserve cursor position later.
  const leafIds = new Map<string, string>();
  let leafIndex = 0;
  walkLeaves(nodes, (file) => {
    leafIds.set(file.entry.relativePath, ENTRY_ID_PREFIX + leafIndex);
    leafIndex += 1;
  });

  // The tree itself is the focusable container so the WAI-ARIA tree pattern
  // applies cleanly: the focused element holds aria-activedescendant,
  // pointing at whichever leaf the keyboard cursor sits on.
  return (
    `<ul role="tree" class="mdv-sidebar__tree" aria-label="File tree" tabindex="0">` +
    renderNodes(nodes, activeRelativePath, leafIds) +
    `</ul>`
  );
}

function renderNodes(
  nodes: TreeNode[],
  activePath: string | null,
  leafIds: Map<string, string>,
): string {
  return nodes.map((n) => renderNode(n, activePath, leafIds)).join("");
}

function renderNode(
  node: TreeNode,
  activePath: string | null,
  leafIds: Map<string, string>,
): string {
  if (node.type === "dir") {
    return (
      `<li role="treeitem" class="mdv-sidebar__node mdv-sidebar__node--dir" aria-expanded="true">` +
      `<span class="mdv-sidebar__dir-label">${escapeHtml(node.name)}</span>` +
      `<ul role="group" class="mdv-sidebar__group">${renderNodes(node.children, activePath, leafIds)}</ul>` +
      `</li>`
    );
  }
  const path = node.entry.relativePath;
  const id = leafIds.get(path)!;
  const href = "/" + encodePath(path);
  const isActive = path === activePath;
  const ariaCurrent = isActive ? ` aria-current="page" aria-selected="true"` : "";
  return (
    `<li role="treeitem" id="${id}" class="mdv-sidebar__node mdv-sidebar__node--file"` +
    ` data-path="${escapeAttr(path)}"${ariaCurrent}>` +
    `<a class="mdv-sidebar__entry" href="${escapeAttr(href)}" tabindex="-1">` +
    `${escapeHtml(node.name)}` +
    `</a>` +
    `</li>`
  );
}

function walkLeaves(nodes: TreeNode[], cb: (file: TreeNode & { type: "file" }) => void): void {
  for (const n of nodes) {
    if (n.type === "file") cb(n);
    else walkLeaves(n.children, cb);
  }
}
