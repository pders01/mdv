/**
 * Renderer - converts markdown blocks to styled terminal output
 */

import type { Token, Tokens } from "marked";
import { lexer } from "marked";
import type { Block } from "./document";

export interface Style {
  fg?: string;
  bg?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  dim?: boolean;
}

export interface StyledSpan {
  text: string;
  style: Style;
}

export interface RenderedLine {
  spans: StyledSpan[];
}

export interface RenderOptions {
  width: number;
}

// Heading colors by depth (1-6)
const HEADING_COLORS = [
  "#ff6464", // h1
  "#ff9664", // h2
  "#ffc864", // h3
  "#c8c864", // h4
  "#96c864", // h5
  "#64c864", // h6
];

export function renderBlock(block: Block, options: RenderOptions): RenderedLine[] {
  const { token } = block;
  const { width } = options;

  switch (token.type) {
    case "heading":
      return renderHeading(token as Tokens.Heading);

    case "paragraph":
      return renderParagraph(token as Tokens.Paragraph, width);

    case "code":
      return renderCode(token as Tokens.Code, width);

    case "list":
      return renderList(token as Tokens.List, width);

    case "blockquote":
      return renderBlockquote(token as Tokens.Blockquote, width);

    case "hr":
      return renderHr(width);

    case "html":
      return renderHtml(token as Tokens.HTML, width);

    case "table":
      return renderTable(token as Tokens.Table, width);

    default:
      // Fallback: render raw text
      return [{ spans: [{ text: (token as any).raw || "", style: {} }] }];
  }
}

function renderHeading(token: Tokens.Heading): RenderedLine[] {
  const color = HEADING_COLORS[token.depth - 1] || HEADING_COLORS[5];
  const spans = renderInlineTokens(token.tokens || [], { bold: true, fg: color });

  // If no inline tokens, use text directly
  if (spans.length === 0) {
    spans.push({ text: token.text, style: { bold: true, fg: color } });
  }

  return [{ spans }];
}

function renderParagraph(token: Tokens.Paragraph, width: number): RenderedLine[] {
  const spans = renderInlineTokens(token.tokens || []);

  // If no inline tokens, use text directly
  if (spans.length === 0) {
    spans.push({ text: token.text, style: {} });
  }

  return wrapSpans(spans, width);
}

function renderCode(token: Tokens.Code, width: number): RenderedLine[] {
  const style: Style = { fg: "#dc9664", bg: "#282828" };
  const codeLines = token.text.split("\n");

  return codeLines.map((line) => ({
    spans: [{ text: line, style }],
  }));
}

function renderList(token: Tokens.List, width: number): RenderedLine[] {
  const lines: RenderedLine[] = [];

  token.items.forEach((item, index) => {
    const bullet = token.ordered ? `${index + 1}. ` : "• ";
    const itemSpans = renderInlineTokens(item.tokens || []);

    // Prepend bullet
    if (itemSpans.length === 0) {
      itemSpans.push({ text: item.text, style: {} });
    }

    // Add bullet as first span
    const bulletSpan: StyledSpan = { text: bullet, style: { fg: "#64c8ff" } };
    lines.push({ spans: [bulletSpan, ...itemSpans] });
  });

  return lines;
}

function renderBlockquote(token: Tokens.Blockquote, width: number): RenderedLine[] {
  const lines: RenderedLine[] = [];
  const style: Style = { fg: "#888888", italic: true };

  // Render nested tokens
  if (token.tokens) {
    for (const innerToken of token.tokens) {
      if (innerToken.type === "paragraph") {
        const para = innerToken as Tokens.Paragraph;
        const spans = renderInlineTokens(para.tokens || []);
        if (spans.length === 0) {
          spans.push({ text: para.text, style });
        }
        // Add quote prefix
        const prefixSpan: StyledSpan = { text: "│ ", style: { fg: "#888888" } };
        lines.push({ spans: [prefixSpan, ...applyStyle(spans, style)] });
      } else if (innerToken.type === "blockquote") {
        // Nested blockquote
        const nested = renderBlockquote(innerToken as Tokens.Blockquote, width - 2);
        for (const line of nested) {
          const prefixSpan: StyledSpan = { text: "│ ", style: { fg: "#888888" } };
          lines.push({ spans: [prefixSpan, ...line.spans] });
        }
      }
    }
  }

  if (lines.length === 0) {
    lines.push({ spans: [{ text: "│ " + token.text, style }] });
  }

  return lines;
}

function renderHr(width: number): RenderedLine[] {
  return [{ spans: [{ text: "─".repeat(width), style: { fg: "#555555" } }] }];
}

function renderHtml(token: Tokens.HTML, width: number): RenderedLine[] {
  const html = token.text || token.raw;

  // Try to parse HTML and extract content with appropriate styling
  const parsed = parseSimpleHtml(html);
  if (parsed) {
    return [{ spans: [{ text: parsed.content, style: parsed.style }] }];
  }

  // Fallback: strip all tags
  const stripped = html.replace(/<[^>]+>/g, "").trim();
  return [{ spans: [{ text: stripped || " ", style: {} }] }];
}

function parseSimpleHtml(html: string): { content: string; style: Style } | null {
  // Match heading tags
  const headingMatch = html.match(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/i);
  if (headingMatch) {
    const depth = parseInt(headingMatch[1], 10);
    const content = headingMatch[2].replace(/<[^>]+>/g, "").trim();
    return {
      content,
      style: { bold: true, fg: HEADING_COLORS[depth - 1] || HEADING_COLORS[5] },
    };
  }

  // Match other common tags
  const tagMatch = html.match(/<(\w+)[^>]*>([\s\S]*?)<\/\1>/i);
  if (tagMatch) {
    const tag = tagMatch[1].toLowerCase();
    const content = tagMatch[2].replace(/<[^>]+>/g, "").trim();

    switch (tag) {
      case "strong":
      case "b":
        return { content, style: { bold: true } };
      case "em":
      case "i":
        return { content, style: { italic: true } };
      case "code":
        return { content, style: { fg: "#dc9664", bg: "#282828" } };
      case "a":
        return { content, style: { fg: "#6496ff", underline: true } };
      case "del":
      case "s":
        return { content, style: { dim: true } };
      default:
        return { content, style: {} };
    }
  }

  // Self-closing tags
  if (html.match(/<br\s*\/?>/i)) {
    return { content: "", style: {} };
  }

  return null;
}

function renderTable(token: Tokens.Table, width: number): RenderedLine[] {
  const lines: RenderedLine[] = [];

  // Header
  const headerCells = token.header.map((cell) => cell.text);
  lines.push({ spans: [{ text: headerCells.join(" │ "), style: { bold: true } }] });

  // Rows
  for (const row of token.rows) {
    const cells = row.map((cell) => cell.text);
    lines.push({ spans: [{ text: cells.join(" │ "), style: {} }] });
  }

  return lines;
}

// --- Inline rendering ---

export function renderInline(text: string): StyledSpan[] {
  // Parse inline markdown using lexer
  const tokens = lexer(text);

  // Lexer wraps in paragraph, get its tokens
  if (tokens.length === 1 && tokens[0].type === "paragraph") {
    const para = tokens[0] as Tokens.Paragraph;
    return renderInlineTokens(para.tokens || []);
  }

  return [{ text, style: {} }];
}

function renderInlineTokens(tokens: Token[], baseStyle: Style = {}): StyledSpan[] {
  const spans: StyledSpan[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case "text":
        spans.push({ text: (token as Tokens.Text).text, style: { ...baseStyle } });
        break;

      case "strong": {
        const strong = token as Tokens.Strong;
        const innerSpans = renderInlineTokens(strong.tokens || [], {
          ...baseStyle,
          bold: true,
        });
        if (innerSpans.length === 0) {
          spans.push({ text: strong.text, style: { ...baseStyle, bold: true } });
        } else {
          spans.push(...innerSpans);
        }
        break;
      }

      case "em": {
        const em = token as Tokens.Em;
        const innerSpans = renderInlineTokens(em.tokens || [], {
          ...baseStyle,
          italic: true,
        });
        if (innerSpans.length === 0) {
          spans.push({ text: em.text, style: { ...baseStyle, italic: true } });
        } else {
          spans.push(...innerSpans);
        }
        break;
      }

      case "codespan": {
        const code = token as Tokens.Codespan;
        spans.push({
          text: code.text,
          style: { ...baseStyle, fg: "#dc9664", bg: "#282828" },
        });
        break;
      }

      case "del": {
        const del = token as Tokens.Del;
        spans.push({ text: del.text, style: { ...baseStyle, dim: true } });
        break;
      }

      case "link": {
        const link = token as Tokens.Link;
        spans.push({
          text: link.text,
          style: { ...baseStyle, fg: "#6496ff", underline: true },
        });
        break;
      }

      case "image": {
        const img = token as Tokens.Image;
        spans.push({
          text: `[${img.text || img.title || "image"}]`,
          style: { ...baseStyle, fg: "#888888" },
        });
        break;
      }

      case "html": {
        // Inline HTML - try to extract text
        const html = (token as Tokens.HTML).raw;
        const text = html.replace(/<[^>]+>/g, "");
        if (text) {
          spans.push({ text, style: { ...baseStyle } });
        }
        break;
      }

      case "escape": {
        const esc = token as Tokens.Escape;
        spans.push({ text: esc.text, style: { ...baseStyle } });
        break;
      }

      case "br":
        spans.push({ text: "\n", style: {} });
        break;

      default:
        // Unknown token, try to get text
        const raw = (token as any).text || (token as any).raw || "";
        if (raw) {
          spans.push({ text: raw, style: { ...baseStyle } });
        }
    }
  }

  return spans;
}

function applyStyle(spans: StyledSpan[], style: Style): StyledSpan[] {
  return spans.map((span) => ({
    text: span.text,
    style: { ...style, ...span.style },
  }));
}

// --- Text wrapping ---

function wrapSpans(spans: StyledSpan[], width: number): RenderedLine[] {
  const lines: RenderedLine[] = [];
  let currentLine: StyledSpan[] = [];
  let currentWidth = 0;

  for (const span of spans) {
    const words = span.text.split(/(\s+)/);

    for (const word of words) {
      if (!word) continue;

      const wordWidth = word.length;

      // If word fits on current line
      if (currentWidth + wordWidth <= width) {
        // Try to merge with previous span if same style
        const lastSpan = currentLine[currentLine.length - 1];
        if (lastSpan && stylesEqual(lastSpan.style, span.style)) {
          lastSpan.text += word;
        } else {
          currentLine.push({ text: word, style: span.style });
        }
        currentWidth += wordWidth;
      } else {
        // Word doesn't fit - start new line
        if (currentLine.length > 0) {
          lines.push({ spans: currentLine });
        }
        currentLine = [{ text: word, style: span.style }];
        currentWidth = wordWidth;
      }
    }
  }

  // Don't forget last line
  if (currentLine.length > 0) {
    lines.push({ spans: currentLine });
  }

  return lines.length > 0 ? lines : [{ spans: [{ text: "", style: {} }] }];
}

function stylesEqual(a: Style, b: Style): boolean {
  return (
    a.fg === b.fg &&
    a.bg === b.bg &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.dim === b.dim
  );
}
