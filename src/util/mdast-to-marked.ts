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

export function mdastRootToTokens(root: Root): Token[] {
  const defs = collectDefinitions(root);
  return root.children.map((node) => convertBlock(node, defs)).filter((t): t is Token => t !== null);
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

function convertBlock(node: RootContent, defs: DefMap): Token | null {
  switch (node.type) {
    case "heading":
      return headingToken(node as Heading, defs);
    case "paragraph":
      return paragraphToken(node as Paragraph, defs);
    case "list":
      return listToken(node as List, defs);
    case "code":
      return codeToken(node as Code);
    case "blockquote":
      return blockquoteToken(node as Blockquote, defs);
    case "table":
      return tableToken(node as Table, defs);
    case "thematicBreak":
      return { type: "hr", raw: "---\n" } as unknown as Token;
    case "html":
      return htmlToken(node as Html);
    case "definition":
      return definitionToken(node as Definition);
    default:
      return null;
  }
}

function headingToken(node: Heading, defs: DefMap): Token {
  const tokens = node.children.map((c) => convertInline(c, defs));
  const text = tokens.map((t) => extractText(t)).join("");
  return {
    type: "heading",
    raw: "",
    depth: node.depth,
    text,
    tokens,
  } as unknown as Token;
}

function paragraphToken(node: Paragraph, defs: DefMap): Token {
  const tokens = node.children.map((c) => convertInline(c, defs));
  const text = tokens.map((t) => extractText(t)).join("");
  return {
    type: "paragraph",
    raw: "",
    text,
    tokens,
  } as unknown as Token;
}

function listToken(node: List, defs: DefMap): Token {
  const items: MarkedListItem[] = node.children.map((li) => listItemToken(li, defs, !!node.spread));
  return {
    type: "list",
    raw: "",
    ordered: !!node.ordered,
    start: typeof node.start === "number" ? node.start : "",
    loose: !!node.spread,
    items,
  } as unknown as Token;
}

function listItemToken(node: ListItem, defs: DefMap, parentSpread: boolean): MarkedListItem {
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
    tokens = p.children.map((c) => convertInline(c, defs));
  } else {
    tokens = blockChildren
      .map((c) => convertBlock(c, defs))
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

function blockquoteToken(node: Blockquote, defs: DefMap): Token {
  const tokens = node.children
    .map((c) => convertBlock(c, defs))
    .filter((t): t is Token => t !== null);
  const text = tokens.map((t) => extractText(t)).join("\n");
  return {
    type: "blockquote",
    raw: "",
    text,
    tokens,
  } as unknown as Token;
}

function tableToken(node: Table, defs: DefMap): Token {
  const align = (node.align ?? []).map((a) => (a === null ? null : a));
  const headerRow = node.children[0] as TableRow | undefined;
  const bodyRows = node.children.slice(1) as TableRow[];
  const header = headerRow
    ? headerRow.children.map((cell) => ({
        text: cell.children.map((c) => extractText(convertInline(c, defs))).join(""),
        tokens: cell.children.map((c) => convertInline(c, defs)),
      }))
    : [];
  const rows = bodyRows.map((row) =>
    row.children.map((cell) => ({
      text: cell.children.map((c) => extractText(convertInline(c, defs))).join(""),
      tokens: cell.children.map((c) => convertInline(c, defs)),
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

function convertInline(node: PhrasingContent, defs: DefMap): Token {
  switch (node.type) {
    case "text":
      return {
        type: "text",
        raw: (node as Text).value,
        text: (node as Text).value,
      } as unknown as Token;
    case "emphasis": {
      const e = node as Emphasis;
      const tokens = e.children.map((c) => convertInline(c, defs));
      return {
        type: "em",
        raw: "",
        text: tokens.map(extractText).join(""),
        tokens,
      } as unknown as Token;
    }
    case "strong": {
      const s = node as Strong;
      const tokens = s.children.map((c) => convertInline(c, defs));
      return {
        type: "strong",
        raw: "",
        text: tokens.map(extractText).join(""),
        tokens,
      } as unknown as Token;
    }
    case "delete": {
      const d = node as Delete;
      const tokens = d.children.map((c) => convertInline(c, defs));
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
      const tokens = l.children.map((c) => convertInline(c, defs));
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
      const def = defs.get(lr.identifier);
      const tokens = lr.children.map((c) => convertInline(c, defs));
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
      const def = defs.get(ir.identifier);
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
    default:
      return {
        type: "text",
        raw: "",
        text: "",
      } as unknown as Token;
  }
}

function extractText(token: Token): string {
  const t = token as Token & { text?: string };
  return typeof t.text === "string" ? t.text : "";
}
