/**
 * mdast → marked-shaped token converter.
 *
 * Bridges the unified parser into the existing TUI rendering layer.
 * `src/rendering/*` and OpenTUI integrations all consume `marked.Token`
 * shapes; rather than rewrite every renderer to accept mdast (a separate,
 * later effort), we translate the mdast tree into the same shape `marked`
 * would have produced.
 *
 * Translation is one-shot per parse — no streaming or incremental reuse.
 * Inline trees are walked bottom-up so the resulting `tokens` array on each
 * block matches what marked.lex would emit, including the `text` field
 * (concatenated raw text, used by some renderers as a quick path).
 *
 * Coverage matches the actual rendering surface:
 *   block: heading, paragraph, list (incl GFM tasks), code, blockquote,
 *          table (GFM), thematicBreak, html, definition (link refs)
 *   inline: text, escape, strong/emphasis, codespan, link/image (incl
 *           reference forms), break (hard), del (GFM), html
 *
 * Footnote / wiki-link / directive plugins extend mdast beyond this set;
 * they need their own block-handler entries when introduced.
 */

import type {
  Root,
  RootContent,
  PhrasingContent,
  Heading,
  Paragraph,
  List,
  ListItem,
  Code,
  Blockquote,
  Table,
  TableRow,
  Html,
  Definition,
  Text,
  Emphasis,
  Strong,
  Delete,
  InlineCode,
  Link,
  Image,
  LinkReference,
  ImageReference,
  Break,
  FootnoteReference,
  FootnoteDefinition,
} from "mdast";
import type { Token } from "marked";

interface MarkedListItem {
  type: "list_item";
  raw: string;
  task: boolean;
  checked?: boolean;
  loose: boolean;
  text: string;
  tokens: Token[];
}

/** Definition lookup table keyed by normalized identifier (mdast convention). */
type DefMap = Map<string, { url: string; title?: string }>;

/** Footnote identifier → 1-based index in source order, used to render
 *  references as `[N]` and definitions as `[N]: ...` without hash links. */
type FootnoteMap = Map<string, number>;

export interface ConvertContext {
  defs: DefMap;
  footnotes: FootnoteMap;
}

export function mdastRootToTokens(root: Root): Token[] {
  const ctx: ConvertContext = {
    defs: collectDefinitions(root),
    footnotes: collectFootnoteIndex(root),
  };
  return root.children.map((node) => convertBlock(node, ctx)).filter((t): t is Token => t !== null);
}

function collectFootnoteIndex(root: Root): FootnoteMap {
  const map: FootnoteMap = new Map();
  let n = 1;
  for (const node of walk(root.children)) {
    if (node.type === "footnoteDefinition") {
      const id = (node as FootnoteDefinition).identifier;
      if (!map.has(id)) map.set(id, n++);
    }
  }
  return map;
}

function collectDefinitions(root: Root): DefMap {
  const map: DefMap = new Map();
  for (const node of walk(root.children)) {
    if (node.type === "definition") {
      const def = node as Definition;
      map.set(def.identifier, { url: def.url, title: def.title ?? undefined });
    }
  }
  return map;
}

function* walk(nodes: readonly { type: string; children?: unknown }[]): Generator<{ type: string }> {
  for (const n of nodes) {
    yield n;
    const kids = (n as { children?: unknown[] }).children;
    if (Array.isArray(kids)) yield* walk(kids as { type: string }[]);
  }
}

function convertBlock(node: RootContent, ctx: ConvertContext): Token | null {
  switch (node.type) {
    case "heading":
      return headingToken(node as Heading, ctx);
    case "paragraph":
      return paragraphToken(node as Paragraph, ctx);
    case "list":
      return listToken(node as List, ctx);
    case "code":
      return codeToken(node as Code);
    case "blockquote":
      return blockquoteToken(node as Blockquote, ctx);
    case "table":
      return tableToken(node as Table, ctx);
    case "thematicBreak":
      return { type: "hr", raw: "---\n" } as unknown as Token;
    case "math": {
      const m = node as { type: "math"; value: string; meta?: string | null };
      return {
        type: "code",
        raw: "",
        lang: "math",
        text: m.value,
      } as unknown as Token;
    }
    case "html":
      return htmlToken(node as Html);
    case "definition":
      return definitionToken(node as Definition);
    case "footnoteDefinition":
      return footnoteDefinitionToken(node as FootnoteDefinition, ctx);
    case "descriptionlist":
      return descriptionListToken(node as { children: unknown[] }, ctx);
    case "containerDirective":
    case "leafDirective":
      return directiveToken(node as DirectiveNode, ctx);
    default:
      return null;
  }
}

function headingToken(node: Heading, ctx: ConvertContext): Token {
  const tokens = node.children.map((c) => convertInline(c, ctx));
  const text = tokens.map((t) => extractText(t)).join("");
  return {
    type: "heading",
    raw: "",
    depth: node.depth,
    text,
    tokens,
  } as unknown as Token;
}

function paragraphToken(node: Paragraph, ctx: ConvertContext): Token {
  const tokens = node.children.map((c) => convertInline(c, ctx));
  const text = tokens.map((t) => extractText(t)).join("");
  return {
    type: "paragraph",
    raw: "",
    text,
    tokens,
  } as unknown as Token;
}

function listToken(node: List, ctx: ConvertContext): Token {
  const items: MarkedListItem[] = node.children.map((li) => listItemToken(li, ctx, !!node.spread));
  return {
    type: "list",
    raw: "",
    ordered: !!node.ordered,
    start: typeof node.start === "number" ? node.start : "",
    loose: !!node.spread,
    items,
  } as unknown as Token;
}

function listItemToken(node: ListItem, ctx: ConvertContext, parentSpread: boolean): MarkedListItem {
  // mdast list items have block children. Marked's list-item.tokens flattens
  // a single-paragraph child into inline tokens; multi-block items keep
  // block tokens. Mirror that.
  const blockChildren = node.children;
  let tokens: Token[];
  if (
    !parentSpread &&
    !node.spread &&
    blockChildren.length === 1 &&
    blockChildren[0]!.type === "paragraph"
  ) {
    const p = blockChildren[0] as Paragraph;
    tokens = p.children.map((c) => convertInline(c, ctx));
  } else {
    tokens = blockChildren
      .map((c) => convertBlock(c, ctx))
      .filter((t): t is Token => t !== null);
  }
  const text = tokens.map((t) => extractText(t)).join("");
  const task = typeof node.checked === "boolean";
  const item: MarkedListItem = {
    type: "list_item",
    raw: "",
    task,
    loose: parentSpread || !!node.spread,
    text,
    tokens,
  };
  if (task) item.checked = !!node.checked;
  return item;
}

function codeToken(node: Code): Token {
  return {
    type: "code",
    raw: "",
    lang: node.lang ?? "",
    text: node.value,
  } as unknown as Token;
}

function blockquoteToken(node: Blockquote, ctx: ConvertContext): Token {
  const alertKind = detectAlertKind(node);
  if (alertKind) stripAlertMarker(node);
  const tokens = node.children
    .map((c) => convertBlock(c, ctx))
    .filter((t): t is Token => t !== null);
  const text = tokens.map((t) => extractText(t)).join("\n");
  return {
    type: "blockquote",
    raw: "",
    text,
    tokens,
    ...(alertKind ? { alertKind } : {}),
  } as unknown as Token;
}

/** Recognized GitHub alert kinds. Lower-case for renderer dispatch. */
export type AlertKind = "note" | "tip" | "important" | "warning" | "caution";

/**
 * GitHub-flavored alert syntax: a blockquote whose first child paragraph
 * starts with `[!KIND]` (and optionally a newline before the body). Detect
 * here so the renderer can ditch the literal `[!NOTE]` line and pick a
 * color/icon by kind.
 */
function detectAlertKind(node: Blockquote): AlertKind | null {
  const firstBlock = node.children[0];
  if (!firstBlock || firstBlock.type !== "paragraph") return null;
  const firstInline = firstBlock.children[0];
  if (!firstInline || firstInline.type !== "text") return null;
  const m = (firstInline.value ?? "").match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s|$)/);
  if (!m) return null;
  return m[1]!.toLowerCase() as AlertKind;
}

/**
 * Removes the `[!KIND]` marker (and the immediately following newline) from
 * the blockquote's first text node. If the resulting text is empty, drop
 * the text node entirely so the renderer doesn't emit a leading blank line.
 */
function stripAlertMarker(node: Blockquote): void {
  const firstBlock = node.children[0];
  if (!firstBlock || firstBlock.type !== "paragraph") return;
  const firstInline = firstBlock.children[0];
  if (!firstInline || firstInline.type !== "text") return;
  const stripped = firstInline.value.replace(
    /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\r?\n)?/,
    "",
  );
  if (stripped === "") {
    firstBlock.children.shift();
  } else {
    firstInline.value = stripped;
  }
}

function tableToken(node: Table, ctx: ConvertContext): Token {
  const align = (node.align ?? []).map((a) => (a === null ? null : a));
  const headerRow = node.children[0] as TableRow | undefined;
  const bodyRows = node.children.slice(1) as TableRow[];
  const header = headerRow
    ? headerRow.children.map((cell) => ({
        text: cell.children.map((c) => extractText(convertInline(c, ctx))).join(""),
        tokens: cell.children.map((c) => convertInline(c, ctx)),
      }))
    : [];
  const rows = bodyRows.map((row) =>
    row.children.map((cell) => ({
      text: cell.children.map((c) => extractText(convertInline(c, ctx))).join(""),
      tokens: cell.children.map((c) => convertInline(c, ctx)),
    })),
  );
  return {
    type: "table",
    raw: "",
    align,
    header,
    rows,
  } as unknown as Token;
}

function htmlToken(node: Html): Token {
  return {
    type: "html",
    raw: node.value,
    block: true,
    text: node.value,
  } as unknown as Token;
}

function definitionToken(node: Definition): Token {
  return {
    type: "def",
    raw: "",
    label: node.label ?? node.identifier,
    href: node.url,
    title: node.title ?? "",
  } as unknown as Token;
}

function convertInline(node: PhrasingContent, ctx: ConvertContext): Token {
  switch (node.type) {
    case "text":
      return {
        type: "text",
        raw: (node as Text).value,
        text: (node as Text).value,
      } as unknown as Token;
    case "emphasis": {
      const e = node as Emphasis;
      const tokens = e.children.map((c) => convertInline(c, ctx));
      return {
        type: "em",
        raw: "",
        text: tokens.map(extractText).join(""),
        tokens,
      } as unknown as Token;
    }
    case "strong": {
      const s = node as Strong;
      const tokens = s.children.map((c) => convertInline(c, ctx));
      return {
        type: "strong",
        raw: "",
        text: tokens.map(extractText).join(""),
        tokens,
      } as unknown as Token;
    }
    case "delete": {
      const d = node as Delete;
      const tokens = d.children.map((c) => convertInline(c, ctx));
      return {
        type: "del",
        raw: "",
        text: tokens.map(extractText).join(""),
        tokens,
      } as unknown as Token;
    }
    case "inlineCode": {
      const c = node as InlineCode;
      return {
        type: "codespan",
        raw: "",
        text: c.value,
      } as unknown as Token;
    }
    case "link": {
      const l = node as Link;
      const tokens = l.children.map((c) => convertInline(c, ctx));
      return {
        type: "link",
        raw: "",
        href: l.url,
        title: l.title ?? "",
        text: tokens.map(extractText).join(""),
        tokens,
      } as unknown as Token;
    }
    case "image": {
      const i = node as Image;
      return {
        type: "image",
        raw: "",
        href: i.url,
        title: i.title ?? "",
        text: i.alt ?? "",
      } as unknown as Token;
    }
    case "linkReference": {
      const lr = node as LinkReference;
      const def = ctx.defs.get(lr.identifier);
      const tokens = lr.children.map((c) => convertInline(c, ctx));
      const text = tokens.map(extractText).join("");
      if (!def) {
        // Unresolved ref → treat as plain text (label kept literal).
        return { type: "text", raw: text, text } as unknown as Token;
      }
      return {
        type: "link",
        raw: "",
        href: def.url,
        title: def.title ?? "",
        text,
        tokens,
      } as unknown as Token;
    }
    case "imageReference": {
      const ir = node as ImageReference;
      const def = ctx.defs.get(ir.identifier);
      if (!def) {
        return { type: "text", raw: ir.alt ?? "", text: ir.alt ?? "" } as unknown as Token;
      }
      return {
        type: "image",
        raw: "",
        href: def.url,
        title: def.title ?? "",
        text: ir.alt ?? "",
      } as unknown as Token;
    }
    case "break":
      void (node as Break);
      return { type: "br", raw: "\n" } as unknown as Token;
    case "html":
      return {
        type: "html",
        raw: (node as Html).value,
        block: false,
        text: (node as Html).value,
      } as unknown as Token;
    case "footnoteReference": {
      const fr = node as FootnoteReference;
      const n = ctx.footnotes.get(fr.identifier);
      const label = n != null ? `[${n}]` : `[^${fr.identifier}]`;
      return { type: "text", raw: label, text: label } as unknown as Token;
    }
    case "inlineMath": {
      // Best-effort TUI rendering: surface the LaTeX source verbatim,
      // wrapped in `$…$` so it's still recognizable. The server gets full
      // KaTeX rendering via rehype-katex; the terminal is plain text only.
      const im = node as { type: "inlineMath"; value: string };
      const text = `$${im.value}$`;
      return { type: "codespan", raw: "", text } as unknown as Token;
    }
    case "mark": {
      const m = node as { type: "mark"; children: PhrasingContent[] };
      const tokens = m.children.map((c) => convertInline(c, ctx));
      const text = tokens.map(extractText).join("");
      return { type: "mark", raw: "", text, tokens } as unknown as Token;
    }
    case "subscript": {
      const s = node as { type: "subscript"; children: PhrasingContent[] };
      const tokens = s.children.map((c) => convertInline(c, ctx));
      const text = tokens.map(extractText).join("");
      return { type: "subscript", raw: "", text, tokens } as unknown as Token;
    }
    case "superscript": {
      const s = node as { type: "superscript"; children: PhrasingContent[] };
      const tokens = s.children.map((c) => convertInline(c, ctx));
      const text = tokens.map(extractText).join("");
      return { type: "superscript", raw: "", text, tokens } as unknown as Token;
    }
    case "textDirective": {
      // Inline directive `:name[content]` — render content as plain text.
      // Surfaces the directive's children without the `:name` wrapper, so
      // the TUI doesn't show `:emoji[smile]` as literal punctuation.
      const td = node as { type: "textDirective"; children?: PhrasingContent[] };
      const tokens = (td.children ?? []).map((c) => convertInline(c, ctx));
      const text = tokens.map(extractText).join("");
      return { type: "text", raw: text, text } as unknown as Token;
    }
    case "wikiLink": {
      // Obsidian-style `[[Page]]` / `[[Page|Label]]`. The plugin populates
      // `value` (target) and `data.alias` (display label, defaults to value
      // when no `|` divider). For the TUI we render it as a link to the
      // permalink slug — same behavior as the server's hast output.
      const wl = node as {
        type: "wikiLink";
        value: string;
        data?: { alias?: string; permalink?: string };
      };
      const text = wl.data?.alias ?? wl.value;
      const slug = wl.data?.permalink ?? wl.value;
      return {
        type: "link",
        raw: "",
        href: `#/page/${slug}`,
        title: "",
        text,
        tokens: [{ type: "text", raw: text, text } as unknown as Token],
      } as unknown as Token;
    }
    default:
      return {
        type: "text",
        raw: "",
        text: "",
      } as unknown as Token;
  }
}

/**
 * Render a footnote definition as a paragraph prefixed with `[N] `. The
 * server's HTML output gets a proper `<section>` with backrefs via
 * remark-gfm; the TUI fallback is a plain bottom-of-page paragraph since
 * terminal rendering has no concept of intra-document anchors.
 */
function footnoteDefinitionToken(node: FootnoteDefinition, ctx: ConvertContext): Token {
  const n = ctx.footnotes.get(node.identifier);
  const prefix = n != null ? `[${n}] ` : `[^${node.identifier}] `;
  // Inline children of the first paragraph (footnotes are nearly always
  // single-paragraph in practice).
  const firstPara = node.children[0];
  const tokens: Token[] = [
    { type: "text", raw: prefix, text: prefix } as unknown as Token,
  ];
  if (firstPara && firstPara.type === "paragraph") {
    for (const child of firstPara.children) {
      tokens.push(convertInline(child, ctx));
    }
  }
  const text = tokens.map(extractText).join("");
  return {
    type: "paragraph",
    raw: "",
    text,
    tokens,
  } as unknown as Token;
}

function extractText(token: Token): string {
  const t = token as Token & { text?: string };
  return typeof t.text === "string" ? t.text : "";
}

interface DirectiveNode {
  type: "containerDirective" | "leafDirective" | "textDirective";
  name: string;
  children?: unknown[];
}

/**
 * `remark-deflist` produces `descriptionlist` containers with alternating
 * `descriptionterm` / `descriptiondetails` children. Flatten into a list
 * of `{term, defs[]}` pairs so the renderer can print
 *   Term
 *     Definition 1
 *     Definition 2
 * without needing a new mdast walker.
 */
function descriptionListToken(node: { children: unknown[] }, ctx: ConvertContext): Token {
  const items: Array<{ term: Token[]; defs: Token[][] }> = [];
  let current: { term: Token[]; defs: Token[][] } | null = null;
  for (const child of node.children) {
    const c = child as { type: string; children?: PhrasingContent[] };
    if (c.type === "descriptionterm") {
      current = {
        term: (c.children ?? []).map((cc) => convertInline(cc, ctx)),
        defs: [],
      };
      items.push(current);
    } else if (c.type === "descriptiondetails" && current) {
      current.defs.push((c.children ?? []).map((cc) => convertInline(cc, ctx)));
    }
  }
  return {
    type: "deflist",
    raw: "",
    items,
  } as unknown as Token;
}

/**
 * `:::name` containers and `::name` leafs from `remark-directive`. Names
 * matching GFM alert kinds map onto the alert path so directive users get
 * the same coloured rendering. Other names render as a labelled
 * blockquote (the name appears as a bold header above the body).
 */
function directiveToken(node: DirectiveNode, ctx: ConvertContext): Token {
  const alertKind = (
    ["note", "tip", "important", "warning", "caution"] as const
  ).find((k) => k === node.name.toLowerCase());

  const tokens = (node.children ?? [])
    .map((c) => convertBlock(c as RootContent, ctx))
    .filter((t): t is Token => t !== null);

  if (alertKind) {
    return {
      type: "blockquote",
      raw: "",
      text: tokens.map(extractText).join("\n"),
      tokens,
      alertKind,
    } as unknown as Token;
  }

  // Labelled blockquote: prepend a bold header paragraph naming the
  // directive so the reader can tell it apart from a regular quote.
  const header = {
    type: "paragraph",
    raw: "",
    text: node.name,
    tokens: [
      { type: "strong", raw: "", text: node.name, tokens: [{ type: "text", raw: node.name, text: node.name }] },
    ],
  } as unknown as Token;

  const body = [header, ...tokens];
  return {
    type: "blockquote",
    raw: "",
    text: body.map(extractText).join("\n"),
    tokens: body,
  } as unknown as Token;
}
