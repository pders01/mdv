/** Shared Markdown → Spec orchestration. No renderables are constructed here. */
import type { Renderable } from "@opentui/core";
import type { Token } from "marked";
import { unified, type Processor } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import remarkMath from "remark-math";
import wikiLink from "remark-wiki-link";
import remarkDeflist from "remark-deflist";
import remarkDirective from "remark-directive";
import remarkMarkers from "remark-flexible-markers";
import remarkSupersub from "remark-supersub";
import type { Root } from "mdast";
import { mdastRootToTokens } from "../util/mdast-to-marked.js";
import { restoreBareDirectives } from "../util/restore-bare-directives.js";
import type { Spec } from "./spec.js";

export interface RenderNodeContext {
  conceal: boolean;
  defaultRender: () => Renderable | null;
  sourceLineStart: number;
}

export type RenderNode = (token: Token, context: RenderNodeContext) => Spec | null | undefined;

let sharedProcessor: Processor<Root, Root, Root, Root, string> | null = null;
function getProcessor(): Processor<Root, Root, Root, Root, string> {
  if (!sharedProcessor) {
    sharedProcessor = unified()
      .use(remarkParse)
      .use(remarkFrontmatter, ["yaml", "toml"])
      .use(remarkGfm, { singleTilde: false })
      .use(remarkMath)
      .use(wikiLink, { aliasDivider: "|" })
      .use(remarkDeflist)
      .use(remarkDirective)
      .use(restoreBareDirectives)
      .use(remarkMarkers)
      .use(remarkSupersub) as unknown as Processor<Root, Root, Root, Root, string>;
  }
  return sharedProcessor;
}

export function documentToSpecs(content: string, renderNode: RenderNode, conceal = true): Spec[] {
  if (!content) return [];
  const proc = getProcessor();
  // Passing the source to runSync preserves offset-based plugin transforms.
  const tree = proc.runSync(proc.parse(content), content) as Root;
  const tokens = mdastRootToTokens(tree, content);
  const specs: Spec[] = [];
  const context: RenderNodeContext = { conceal, defaultRender: () => null, sourceLineStart: 0 };
  for (let i = 0; i < tokens.length; i++) {
    const position = tree.children[i]?.position;
    const start = (position?.start.line ?? 1) - 1;
    const end = (position?.end.line ?? position?.start.line ?? 1) - 1;
    context.sourceLineStart = start;
    const spec = renderNode(tokens[i]!, context);
    if (!spec) continue;
    spec.source = { start, end };
    specs.push(spec);
  }
  return specs;
}
