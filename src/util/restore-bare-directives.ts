import type { Root } from "mdast";
import type { VFile } from "vfile";

type MutableNode = {
  type: string;
  name?: string;
  value?: string;
  position?: { start?: { offset?: number }; end?: { offset?: number } };
  children?: MutableNode[];
};

/**
 * remark-directive treats even a bare `:name` as an inline directive. In prose
 * this eats times, digests, and ordinary colon-separated words. Only explicit
 * directives (with a label or attributes) need directive rendering in mdv.
 */
export function restoreBareDirectives() {
  return (tree: Root, file: VFile) => {
    const source = String(file.value);
    const visit = (node: MutableNode) => {
      for (const child of node.children ?? []) {
        if (child.type === "textDirective") {
          const start = child.position?.start?.offset;
          const end = child.position?.end?.offset;
          // Don't flatten labeled or attributed directives (or their inline content).
          if (
            start !== undefined &&
            end !== undefined &&
            source.slice(start, end) === `:${child.name}`
          ) {
            child.type = "text";
            child.value = source.slice(start, end);
            delete child.name;
            delete child.children;
            continue;
          }
        }
        visit(child);
      }
    };
    visit(tree as MutableNode);
    return tree;
  };
}
