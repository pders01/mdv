/**
 * mdv - Markdown Viewer TUI
 * Uses OpenTUI's MarkdownRenderable with vim keybindings
 */

import { parseArgs } from "util";
import { basename } from "path";
import {
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  createCliRenderer,
  MarkdownRenderable,
  SyntaxStyle,
  StyledText,
  TextAttributes,
  RGBA,
  type KeyEvent,
} from "@opentui/core";
import type { Token } from "marked";
import { createHighlighter, type Highlighter, type BundledLanguage, type BundledTheme } from "shiki";

// =============================================================================
// CLI Argument Parsing
// =============================================================================

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    theme: { type: "string", short: "t", default: "github-dark" },
    "list-themes": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
  allowPositionals: true,
});

if (values.help) {
  console.log("Usage: mdv [options] <markdown-file>");
  console.log("       cat file.md | mdv -");
  console.log("\nOptions:");
  console.log("  -t, --theme <name>  Set syntax highlighting theme (default: github-dark)");
  console.log("  --list-themes       List available themes");
  console.log("  -h, --help          Show this help");
  process.exit(0);
}

if (values["list-themes"]) {
  const { bundledThemes } = await import("shiki");
  console.log("Available themes:");
  Object.keys(bundledThemes).sort().forEach(t => console.log(`  ${t}`));
  process.exit(0);
}

const theme = values.theme as string;
const filePath = positionals[0];

if (!filePath) {
  console.error("Usage: mdv [options] <markdown-file>");
  console.error("       cat file.md | mdv -");
  console.error("\nRun 'mdv --help' for more options");
  process.exit(1);
}

// =============================================================================
// Read File Content
// =============================================================================

let content: string;
if (filePath === "-") {
  content = await Bun.stdin.text();
} else {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  content = await file.text();
}

// =============================================================================
// Shiki Syntax Highlighter
// =============================================================================

const shikiLangs: BundledLanguage[] = [
  "typescript", "javascript", "python", "json", "bash", "html", "css",
  "yaml", "markdown", "rust", "go", "java", "c", "cpp", "ruby", "php",
];

const highlighter: Highlighter = await createHighlighter({
  themes: [theme as BundledTheme],
  langs: shikiLangs,
});

// Extract theme colors for markdown styling
const themeData = highlighter.getTheme(theme as BundledTheme);
const colors = themeData.colors || {};

const themeColors = {
  fg: themeData.fg,
  bg: themeData.bg,
  link: colors["textLink.foreground"] || colors["terminal.ansiBrightBlue"] || themeData.fg,
  red: colors["terminal.ansiBrightRed"] || colors["terminal.ansiRed"] || themeData.fg,
  orange: colors["notificationsWarningIcon.foreground"] || colors["editorBracketHighlight.foreground2"] || themeData.fg,
  yellow: colors["terminal.ansiBrightYellow"] || colors["editorWarning.foreground"] || themeData.fg,
  green: colors["terminal.ansiBrightGreen"] || colors["terminal.ansiGreen"] || themeData.fg,
  cyan: colors["terminal.ansiBrightCyan"] || colors["terminal.ansiCyan"] || themeData.fg,
  blue: colors["terminal.ansiBrightBlue"] || colors["terminal.ansiBlue"] || themeData.fg,
  purple: colors["terminal.ansiBrightMagenta"] || colors["terminal.ansiMagenta"] || themeData.fg,
  gray: colors["editorLineNumber.foreground"] || colors["terminal.ansiBrightBlack"] || themeData.fg,
  codeBg: colors["textCodeBlock.background"] || colors["editor.background"] || themeData.bg,
};

// Convert shiki tokens to OpenTUI TextChunks
interface TextChunk {
  __isChunk: true;
  text: string;
  fg?: typeof RGBA.prototype;
  bold?: boolean;
  italic?: boolean;
}

function shikiToChunks(code: string, lang: string): TextChunk[] {
  const supportedLangs = highlighter.getLoadedLanguages();
  if (!supportedLangs.includes(lang as BundledLanguage)) {
    return [{ __isChunk: true, text: code, fg: RGBA.fromHex(themeColors.fg) }];
  }

  try {
    const result = highlighter.codeToTokens(code, {
      lang: lang as BundledLanguage,
      theme: theme as BundledTheme,
    });

    const chunks: TextChunk[] = [];
    for (let i = 0; i < result.tokens.length; i++) {
      const line = result.tokens[i];
      for (const token of line) {
        const chunk: TextChunk = {
          __isChunk: true,
          text: token.content,
          fg: RGBA.fromHex(token.color || "#E1E4E8"),
        };
        if (token.fontStyle) {
          if (token.fontStyle & 1) chunk.italic = true;
          if (token.fontStyle & 2) chunk.bold = true;
        }
        chunks.push(chunk);
      }
      if (i < result.tokens.length - 1) {
        chunks.push({ __isChunk: true, text: "\n" });
      }
    }
    return chunks;
  } catch {
    return [{ __isChunk: true, text: code, fg: RGBA.fromHex(themeColors.fg) }];
  }
}

// Language aliases
const langAliases: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "bash",
  shell: "bash",
  yml: "yaml",
};

// =============================================================================
// OpenTUI Setup
// =============================================================================

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  useMouse: true,
});

// Markdown syntax style derived from shiki theme
const syntaxStyle = SyntaxStyle.fromStyles({
  "markup.heading": { fg: RGBA.fromHex(themeColors.blue), bold: true },
  "markup.heading.1": { fg: RGBA.fromHex(themeColors.red), bold: true },
  "markup.heading.2": { fg: RGBA.fromHex(themeColors.orange), bold: true },
  "markup.heading.3": { fg: RGBA.fromHex(themeColors.yellow), bold: true },
  "markup.heading.4": { fg: RGBA.fromHex(themeColors.green), bold: true },
  "markup.heading.5": { fg: RGBA.fromHex(themeColors.cyan), bold: true },
  "markup.heading.6": { fg: RGBA.fromHex(themeColors.purple), bold: true },
  "markup.bold": { fg: RGBA.fromHex(themeColors.fg), bold: true },
  "markup.strong": { fg: RGBA.fromHex(themeColors.fg), bold: true },
  "markup.italic": { fg: RGBA.fromHex(themeColors.fg), italic: true },
  "markup.strikethrough": { fg: RGBA.fromHex(themeColors.gray), dim: true },
  "markup.list": { fg: RGBA.fromHex(themeColors.cyan) },
  "markup.quote": { fg: RGBA.fromHex(themeColors.gray), italic: true },
  "markup.raw": { fg: RGBA.fromHex(themeColors.cyan), bg: RGBA.fromHex(themeColors.codeBg) },
  "markup.raw.block": { fg: RGBA.fromHex(themeColors.cyan), bg: RGBA.fromHex(themeColors.codeBg) },
  "markup.link": { fg: RGBA.fromHex(themeColors.link) },
  "markup.link.url": { fg: RGBA.fromHex(themeColors.blue) },
  "markup.link.label": { fg: RGBA.fromHex(themeColors.link) },
  default: { fg: RGBA.fromHex(themeColors.fg) },
});

// =============================================================================
// UI Components
// =============================================================================

const container = new BoxRenderable(renderer, {
  id: "main",
  flexDirection: "column",
  flexGrow: 1,
});

// Track mouse drag state for visual selection
let isDragging = false;
let dragStartLine = 0;

const scrollBox = new ScrollBoxRenderable(renderer, {
  id: "scrollbox",
  flexGrow: 1,
  padding: 1,
  scrollY: true,
  scrollX: false,
  onMouseDown: (event) => {
    // Start a potential drag selection
    isDragging = true;
    const lineHeight = scrollBox.scrollHeight / Math.max(contentLines.length, 1);
    const absoluteY = event.y + scrollBox.scrollTop - 1; // -1 for padding
    dragStartLine = Math.max(0, Math.min(Math.floor(absoluteY / Math.max(lineHeight, 1)), contentLines.length - 1));
  },
  onMouseDrag: (event) => {
    if (!isDragging) return;

    // Enter visual mode if not already
    if (mode !== "visual") {
      enterVisualMode(dragStartLine);
    }

    // Update selection based on current mouse position
    const lineHeight = scrollBox.scrollHeight / Math.max(contentLines.length, 1);
    const absoluteY = event.y + scrollBox.scrollTop - 1;
    visualEnd = Math.max(0, Math.min(Math.floor(absoluteY / Math.max(lineHeight, 1)), contentLines.length - 1));
    updateStatusBar();
  },
  onMouseDragEnd: () => {
    isDragging = false;
    // Keep visual mode active so user can yank with 'y'
  },
});


// =============================================================================
// Custom Token Renderers
// =============================================================================

// Parse HTML and extract text content with basic styling
function parseHtmlContent(html: string): { text: string; bold?: boolean; italic?: boolean; code?: boolean; heading?: number; link?: string } {
  const tagMatch = html.match(/^<(\/?)([\w-]+)([^>]*)>/);
  if (!tagMatch) return { text: html };

  const [, isClosing, tagName] = tagMatch;
  const tag = tagName.toLowerCase();

  // Extract href for links
  const hrefMatch = html.match(/href=["']([^"']+)["']/);
  const href = hrefMatch ? hrefMatch[1] : undefined;

  // Determine styling based on tag
  if (tag === "strong" || tag === "b") return { text: "", bold: !isClosing };
  if (tag === "em" || tag === "i") return { text: "", italic: !isClosing };
  if (tag === "code") return { text: "", code: !isClosing };
  if (tag === "a") return { text: "", link: isClosing ? undefined : href };
  if (tag.match(/^h[1-6]$/)) {
    const level = parseInt(tag[1]);
    return { text: "", heading: isClosing ? undefined : level };
  }

  return { text: "" };
}

// Decode HTML entities
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// Extract text content from HTML block
function extractHtmlBlockContent(html: string): string {
  // Remove HTML tags and extract text
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, "")).trim();
}

// Parse HTML table and render it
function renderHtmlTable(html: string): BoxRenderable {
  const wrapper = new BoxRenderable(renderer, {
    marginTop: 1,
    marginBottom: 1,
    flexDirection: "column",
  });

  // Extract rows
  const rows: string[][] = [];
  const rowMatches = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);

  for (const rowMatch of rowMatches) {
    const rowHtml = rowMatch[1];
    const cells: string[] = [];

    // Extract th and td cells
    const cellMatches = rowHtml.matchAll(/<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi);
    for (const cellMatch of cellMatches) {
      cells.push(extractHtmlBlockContent(cellMatch[2]));
    }

    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  if (rows.length === 0) {
    return wrapper;
  }

  // Calculate column widths
  const colCount = Math.max(...rows.map(r => r.length));
  const colWidths: number[] = Array(colCount).fill(0);

  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      colWidths[i] = Math.max(colWidths[i], row[i].length);
    }
  }

  const cellPadding = 2;
  const paddedWidths = colWidths.map(w => w + cellPadding);

  const padCell = (text: string, width: number): string => {
    const padding = width - text.length;
    return padding > 0 ? text + " ".repeat(padding) : text;
  };

  // Render header row (first row)
  if (rows.length > 0) {
    const headerRow = new BoxRenderable(renderer, { flexDirection: "row" });
    headerRow.add(new TextRenderable(renderer, { content: "│ ", fg: themeColors.gray }));

    for (let i = 0; i < colCount; i++) {
      const cellText = padCell(rows[0][i] || "", paddedWidths[i]);
      headerRow.add(new TextRenderable(renderer, {
        content: cellText,
        fg: themeColors.cyan,
        attributes: TextAttributes.BOLD,
      }));
      if (i < colCount - 1) {
        headerRow.add(new TextRenderable(renderer, { content: "│ ", fg: themeColors.gray }));
      }
    }
    headerRow.add(new TextRenderable(renderer, { content: " │", fg: themeColors.gray }));
    wrapper.add(headerRow);

    // Separator
    const sep = "├" + paddedWidths.map(w => "─".repeat(w + 1)).join("┼") + "─┤";
    wrapper.add(new TextRenderable(renderer, { content: sep, fg: themeColors.gray }));
  }

  // Render data rows
  for (let r = 1; r < rows.length; r++) {
    const dataRow = new BoxRenderable(renderer, { flexDirection: "row" });
    dataRow.add(new TextRenderable(renderer, { content: "│ ", fg: themeColors.gray }));

    for (let i = 0; i < colCount; i++) {
      const cellText = padCell(rows[r][i] || "", paddedWidths[i]);
      dataRow.add(new TextRenderable(renderer, { content: cellText, fg: themeColors.fg }));
      if (i < colCount - 1) {
        dataRow.add(new TextRenderable(renderer, { content: "│ ", fg: themeColors.gray }));
      }
    }
    dataRow.add(new TextRenderable(renderer, { content: " │", fg: themeColors.gray }));
    wrapper.add(dataRow);
  }

  return wrapper;
}

// Parse HTML list (ul/ol) and render it
function renderHtmlList(html: string): BoxRenderable {
  const wrapper = new BoxRenderable(renderer, {
    marginTop: 1,
    marginBottom: 1,
    flexDirection: "column",
  });

  const isOrdered = /<ol/i.test(html);
  const itemMatches = html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi);

  let index = 1;
  for (const match of itemMatches) {
    const itemContent = extractHtmlBlockContent(match[1]);
    const marker = isOrdered ? `${index}.` : "•";

    const itemRow = new BoxRenderable(renderer, { flexDirection: "row" });
    itemRow.add(new TextRenderable(renderer, {
      content: marker + " ",
      fg: themeColors.cyan,
    }));
    itemRow.add(new TextRenderable(renderer, {
      content: itemContent,
      fg: themeColors.fg,
    }));

    wrapper.add(itemRow);
    index++;
  }

  return wrapper;
}

// Render HTML block with proper formatting
function renderHtmlBlock(html: string): BoxRenderable | null {
  // Check for specific HTML elements
  if (/<table/i.test(html)) {
    return renderHtmlTable(html);
  }

  if (/<ul|<ol/i.test(html)) {
    return renderHtmlList(html);
  }

  // Check for headings
  const headingMatch = html.match(/<h([1-6])[^>]*>/i);
  if (headingMatch) {
    return renderHtmlHeading(html, parseInt(headingMatch[1]));
  }

  // For div/p/details etc., extract and render text content
  const content = extractHtmlBlockContent(html);
  if (content) {
    const wrapper = new BoxRenderable(renderer, { marginBottom: 1 });
    wrapper.add(new TextRenderable(renderer, {
      content: content,
      fg: themeColors.fg,
    }));
    return wrapper;
  }

  return null;
}

// Render HTML heading
function renderHtmlHeading(html: string, level: number): BoxRenderable | null {
  const content = extractHtmlBlockContent(html);
  if (!content) return null;

  const headingColors = [
    themeColors.red,    // h1
    themeColors.orange, // h2
    themeColors.yellow, // h3
    themeColors.green,  // h4
    themeColors.cyan,   // h5
    themeColors.purple, // h6
  ];

  const wrapper = new BoxRenderable(renderer, {
    marginTop: level === 1 ? 1 : 0,
    marginBottom: 1,
  });

  wrapper.add(new TextRenderable(renderer, {
    content: content,
    fg: headingColors[level - 1] || themeColors.blue,
    attributes: TextAttributes.BOLD,
  }));

  return wrapper;
}

// Render horizontal rule
function renderHorizontalRule(): BoxRenderable {
  const width = Math.max(renderer.width - 4, 20);
  const line = "─".repeat(width);

  const wrapper = new BoxRenderable(renderer, {
    marginTop: 1,
    marginBottom: 1,
  });

  wrapper.add(new TextRenderable(renderer, {
    content: line,
    fg: themeColors.gray,
  }));

  return wrapper;
}

// Render blockquote with proper styling
function renderBlockquote(token: Token & { tokens?: Token[] }): BoxRenderable {
  const wrapper = new BoxRenderable(renderer, {
    marginTop: 1,
    marginBottom: 1,
    paddingLeft: 2,
  });

  // Add quote bar
  const contentBox = new BoxRenderable(renderer, {
    flexDirection: "row",
  });

  // Extract text from blockquote tokens
  const textContent = extractBlockquoteText(token);

  const quoteBar = new TextRenderable(renderer, {
    content: "│ ",
    fg: themeColors.purple,
  });

  const quoteText = new TextRenderable(renderer, {
    content: textContent,
    fg: themeColors.gray,
    attributes: TextAttributes.ITALIC,
  });

  contentBox.add(quoteBar);
  contentBox.add(quoteText);
  wrapper.add(contentBox);

  return wrapper;
}

// Extract text from blockquote tokens recursively
function extractBlockquoteText(token: Token & { tokens?: Token[]; text?: string; raw?: string }): string {
  if (token.text) return token.text;
  if (!token.tokens) return token.raw || "";

  return token.tokens.map(t => {
    if (t.type === "paragraph" || t.type === "text") {
      return (t as any).text || (t as any).raw || "";
    }
    if (t.type === "blockquote") {
      return "> " + extractBlockquoteText(t as any);
    }
    return extractBlockquoteText(t as any);
  }).join("\n").trim();
}

// List item type definition
interface ListItem {
  type: "list_item";
  text: string;
  tokens?: Token[];
}

interface ListToken extends Token {
  ordered: boolean;
  start?: number | string;
  items: ListItem[];
}

// Paragraph token with inline tokens
interface ParagraphToken extends Token {
  text: string;
  tokens?: Token[];
}

// Unicode subscript/superscript mappings
const subscriptMap: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
  "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
  "a": "ₐ", "e": "ₑ", "o": "ₒ", "x": "ₓ", "h": "ₕ",
  "k": "ₖ", "l": "ₗ", "m": "ₘ", "n": "ₙ", "p": "ₚ",
  "s": "ₛ", "t": "ₜ",
};

const superscriptMap: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
  "a": "ᵃ", "b": "ᵇ", "c": "ᶜ", "d": "ᵈ", "e": "ᵉ",
  "f": "ᶠ", "g": "ᵍ", "h": "ʰ", "i": "ⁱ", "j": "ʲ",
  "k": "ᵏ", "l": "ˡ", "m": "ᵐ", "n": "ⁿ", "o": "ᵒ",
  "p": "ᵖ", "r": "ʳ", "s": "ˢ", "t": "ᵗ", "u": "ᵘ",
  "v": "ᵛ", "w": "ʷ", "x": "ˣ", "y": "ʸ", "z": "ᶻ",
};

function toSubscript(text: string): string {
  return text.split("").map(c => subscriptMap[c] || c).join("");
}

function toSuperscript(text: string): string {
  return text.split("").map(c => superscriptMap[c] || c).join("");
}

// Inline HTML state tracking
interface InlineHtmlState {
  bold: boolean;
  italic: boolean;
  code: boolean;
  subscript: boolean;
  superscript: boolean;
  strikethrough: boolean;
  underline: boolean;
  highlight: boolean;
  kbd: boolean;
  link: boolean;
  linkHref: string | null;
}

// Styled text segment for paragraph rendering
interface StyledSegment {
  text: string;
  fg: string;
  bold: boolean;
  italic: boolean;
}

// Render paragraph with inline HTML support
function renderParagraph(token: ParagraphToken): BoxRenderable | null {
  if (!token.tokens) return null;

  const segments: StyledSegment[] = [];
  const state: InlineHtmlState = {
    bold: false,
    italic: false,
    code: false,
    subscript: false,
    superscript: false,
    strikethrough: false,
    underline: false,
    highlight: false,
    kbd: false,
    link: false,
    linkHref: null,
  };

  const addSegment = (text: string) => {
    if (!text) return;

    // Decode HTML entities
    let processedText = decodeHtmlEntities(text);

    // Apply subscript/superscript
    if (state.subscript) {
      processedText = toSubscript(processedText);
    } else if (state.superscript) {
      processedText = toSuperscript(processedText);
    }

    // Determine color
    let fg = themeColors.fg;
    if (state.link) {
      fg = themeColors.link;
    } else if (state.code || state.kbd) {
      fg = themeColors.cyan;
    } else if (state.strikethrough) {
      fg = themeColors.gray;
    } else if (state.highlight) {
      fg = themeColors.yellow;
    } else if (state.underline) {
      fg = themeColors.green;
    }

    segments.push({
      text: processedText,
      fg: fg,
      bold: state.bold,
      italic: state.italic,
    });
  };

  for (const t of token.tokens) {
    if (t.type === "html") {
      const html = (t as any).raw || "";

      // Parse HTML tag
      const tagMatch = html.match(/^<(\/?)([\w-]+)(?:\s[^>]*)?>(.*)$/s);
      if (tagMatch) {
        const isClosing = tagMatch[1] === "/";
        const tag = tagMatch[2].toLowerCase();
        const content = tagMatch[3] || "";

        // Handle self-closing tags
        if (tag === "br") {
          segments.push({ text: "\n", fg: themeColors.fg, bold: false, italic: false });
          continue;
        }
        if (tag === "img") {
          const altMatch = html.match(/alt=["']([^"']*)["']/);
          const alt = altMatch ? altMatch[1] : "[image]";
          segments.push({ text: `[${alt}]`, fg: themeColors.gray, bold: false, italic: false });
          continue;
        }

        // Update state based on tag
        switch (tag) {
          case "strong":
          case "b":
            state.bold = !isClosing;
            break;
          case "em":
          case "i":
            state.italic = !isClosing;
            break;
          case "code":
          case "samp":
            state.code = !isClosing;
            break;
          case "sub":
            state.subscript = !isClosing;
            break;
          case "sup":
            state.superscript = !isClosing;
            break;
          case "del":
          case "s":
          case "strike":
            state.strikethrough = !isClosing;
            break;
          case "ins":
          case "u":
            state.underline = !isClosing;
            break;
          case "mark":
            state.highlight = !isClosing;
            break;
          case "kbd":
            state.kbd = !isClosing;
            break;
          case "a":
            if (!isClosing) {
              // Opening tag - extract href
              const hrefMatch = html.match(/href=["']([^"']*)["']/);
              state.linkHref = hrefMatch ? hrefMatch[1] : null;
              state.link = true;
            } else {
              // Closing tag - append URL in parentheses if we have one
              if (state.linkHref) {
                segments.push({
                  text: " (" + state.linkHref + ")",
                  fg: themeColors.gray,
                  bold: false,
                  italic: false,
                });
              }
              state.link = false;
              state.linkHref = null;
            }
            break;
          case "abbr":
          case "dfn":
            // Just show the text, no special styling needed
            break;
        }

        if (content.trim()) {
          addSegment(content);
        }
      }
      continue;
    }

    if (t.type === "text") {
      addSegment((t as any).text || "");
    } else if (t.type === "strong") {
      segments.push({
        text: (t as any).text || "",
        fg: themeColors.fg,
        bold: true,
        italic: false,
      });
    } else if (t.type === "em") {
      segments.push({
        text: (t as any).text || "",
        fg: themeColors.fg,
        bold: false,
        italic: true,
      });
    } else if (t.type === "codespan") {
      segments.push({
        text: decodeHtmlEntities((t as any).text || ""),
        fg: themeColors.cyan,
        bold: false,
        italic: false,
      });
    } else if (t.type === "link") {
      const link = t as any;
      // Link text
      segments.push({
        text: link.text || "",
        fg: themeColors.link,
        bold: false,
        italic: false,
      });
      // URL in parentheses (like HTML links)
      if (link.href) {
        segments.push({
          text: " (" + link.href + ")",
          fg: themeColors.gray,
          bold: false,
          italic: false,
        });
      }
    } else if (t.type === "del") {
      segments.push({
        text: (t as any).text || "",
        fg: themeColors.gray,
        bold: false,
        italic: false,
      });
    } else if (t.type === "escape") {
      addSegment((t as any).text || "");
    }
  }

  if (segments.length === 0) return null;

  const wrapper = new BoxRenderable(renderer, {
    marginBottom: 1,
  });

  // Render each segment as a separate TextRenderable
  const textRow = new BoxRenderable(renderer, {
    flexDirection: "row",
    flexWrap: "wrap",
  });

  for (const seg of segments) {
    let attrs = 0;
    if (seg.bold) attrs |= TextAttributes.BOLD;
    if (seg.italic) attrs |= TextAttributes.ITALIC;

    textRow.add(new TextRenderable(renderer, {
      content: seg.text,
      fg: seg.fg,
      attributes: attrs || undefined,
    }));
  }

  wrapper.add(textRow);
  return wrapper;
}
// Table token interface
interface TableToken extends Token {
  header: Array<{ text: string; tokens?: Token[] }>;
  rows: Array<Array<{ text: string; tokens?: Token[] }>>;
  align?: Array<"left" | "center" | "right" | null>;
}

// Render table with proper formatting
function renderTable(token: TableToken): BoxRenderable {
  const wrapper = new BoxRenderable(renderer, {
    marginTop: 1,
    marginBottom: 1,
    flexDirection: "column",
  });

  // Calculate column widths based on content
  const colCount = token.header.length;
  const colWidths: number[] = [];

  // Initialize with header widths
  for (let i = 0; i < colCount; i++) {
    colWidths[i] = token.header[i].text.length;
  }

  // Update with row widths
  for (const row of token.rows) {
    for (let i = 0; i < row.length && i < colCount; i++) {
      colWidths[i] = Math.max(colWidths[i], row[i].text.length);
    }
  }

  // Add padding
  const cellPadding = 2;
  const paddedWidths = colWidths.map(w => w + cellPadding);

  // Helper to pad cell content
  const padCell = (text: string, width: number, align: string | null = "left"): string => {
    const padding = width - text.length;
    if (padding <= 0) return text;
    if (align === "center") {
      const left = Math.floor(padding / 2);
      const right = padding - left;
      return " ".repeat(left) + text + " ".repeat(right);
    } else if (align === "right") {
      return " ".repeat(padding) + text;
    }
    return text + " ".repeat(padding);
  };

  // Render header row
  const headerRow = new BoxRenderable(renderer, {
    flexDirection: "row",
  });

  headerRow.add(new TextRenderable(renderer, {
    content: "│ ",
    fg: themeColors.gray,
  }));

  for (let i = 0; i < colCount; i++) {
    const align = token.align?.[i] || "left";
    const cellText = padCell(token.header[i].text, paddedWidths[i], align);

    headerRow.add(new TextRenderable(renderer, {
      content: cellText,
      fg: themeColors.cyan,
      attributes: TextAttributes.BOLD,
    }));

    if (i < colCount - 1) {
      headerRow.add(new TextRenderable(renderer, {
        content: "│ ",
        fg: themeColors.gray,
      }));
    }
  }

  headerRow.add(new TextRenderable(renderer, {
    content: " │",
    fg: themeColors.gray,
  }));

  wrapper.add(headerRow);

  // Render separator row
  const separatorParts: string[] = [];
  separatorParts.push("├");
  for (let i = 0; i < colCount; i++) {
    separatorParts.push("─".repeat(paddedWidths[i] + 1));
    if (i < colCount - 1) {
      separatorParts.push("┼");
    }
  }
  separatorParts.push("─┤");

  const separatorRow = new BoxRenderable(renderer, {
    flexDirection: "row",
  });
  separatorRow.add(new TextRenderable(renderer, {
    content: separatorParts.join(""),
    fg: themeColors.gray,
  }));
  wrapper.add(separatorRow);

  // Render data rows
  for (const row of token.rows) {
    const dataRow = new BoxRenderable(renderer, {
      flexDirection: "row",
    });

    dataRow.add(new TextRenderable(renderer, {
      content: "│ ",
      fg: themeColors.gray,
    }));

    for (let i = 0; i < colCount; i++) {
      const align = token.align?.[i] || "left";
      const cellContent = i < row.length ? row[i].text : "";
      const cellText = padCell(cellContent, paddedWidths[i], align);

      dataRow.add(new TextRenderable(renderer, {
        content: cellText,
        fg: themeColors.fg,
      }));

      if (i < colCount - 1) {
        dataRow.add(new TextRenderable(renderer, {
          content: "│ ",
          fg: themeColors.gray,
        }));
      }
    }

    dataRow.add(new TextRenderable(renderer, {
      content: " │",
      fg: themeColors.gray,
    }));

    wrapper.add(dataRow);
  }

  return wrapper;
}

// Render inline tokens (for list items, etc.)
function renderInlineTokens(tokens: Token[]): BoxRenderable {
  const row = new BoxRenderable(renderer, {
    flexDirection: "row",
    flexWrap: "wrap",
  });

  for (const t of tokens) {
    if (t.type === "text") {
      row.add(new TextRenderable(renderer, {
        content: (t as any).text || "",
        fg: themeColors.fg,
      }));
    } else if (t.type === "strong") {
      row.add(new TextRenderable(renderer, {
        content: (t as any).text || "",
        fg: themeColors.fg,
        attributes: TextAttributes.BOLD,
      }));
    } else if (t.type === "em") {
      row.add(new TextRenderable(renderer, {
        content: (t as any).text || "",
        fg: themeColors.fg,
        attributes: TextAttributes.ITALIC,
      }));
    } else if (t.type === "codespan") {
      row.add(new TextRenderable(renderer, {
        content: (t as any).text || "",
        fg: themeColors.cyan,
      }));
    } else if (t.type === "link") {
      const link = t as any;
      row.add(new TextRenderable(renderer, {
        content: link.text || "",
        fg: themeColors.link,
      }));
      if (link.href) {
        row.add(new TextRenderable(renderer, {
          content: " (" + link.href + ")",
          fg: themeColors.gray,
        }));
      }
    }
  }

  return row;
}

// Render list with proper indentation for nested lists
function renderList(token: ListToken, depth: number = 0): BoxRenderable {
  const wrapper = new BoxRenderable(renderer, {
    flexDirection: "column",
    marginTop: depth === 0 ? 1 : 0,
    marginBottom: depth === 0 ? 1 : 0,
  });

  const indent = "  ".repeat(depth);
  const marker = token.ordered ? "1." : "•";

  token.items.forEach((item, index) => {
    const itemWrapper = new BoxRenderable(renderer, {
      flexDirection: "column",
    });

    let nestedList: ListToken | null = null;
    let paragraphToken: Token | null = null;

    if (item.tokens) {
      for (const t of item.tokens) {
        if (t.type === "paragraph" || t.type === "text") {
          paragraphToken = t;
        } else if (t.type === "list") {
          nestedList = t as ListToken;
        }
      }
    }

    // Render the list item line
    const lineWrapper = new BoxRenderable(renderer, {
      flexDirection: "row",
    });

    const bulletText = token.ordered ? `${index + 1}.` : marker;

    lineWrapper.add(new TextRenderable(renderer, {
      content: indent + bulletText + " ",
      fg: themeColors.cyan,
    }));

    // Render inline content with proper token handling
    if (paragraphToken && (paragraphToken as any).tokens) {
      const inlineContent = renderInlineTokens((paragraphToken as any).tokens);
      lineWrapper.add(inlineContent);
    } else {
      // Fallback to plain text
      const itemText = item.text?.split("\n")[0] || "";
      lineWrapper.add(new TextRenderable(renderer, {
        content: itemText,
        fg: themeColors.fg,
      }));
    }

    itemWrapper.add(lineWrapper);

    // Render nested list if present
    if (nestedList) {
      const nestedRendered = renderList(nestedList, depth + 1);
      itemWrapper.add(nestedRendered);
    }

    wrapper.add(itemWrapper);
  });

  return wrapper;
}

// Markdown with shiki code highlighting and custom renderers
const markdown = new MarkdownRenderable(renderer, {
  content,
  syntaxStyle,
  conceal: true,
  renderNode: (token: Token, context) => {
    // Handle code blocks with shiki highlighting
    if (token.type === "code") {
      const codeToken = token as Token & { text: string; lang?: string };
      const lang = codeToken.lang
        ? (langAliases[codeToken.lang.toLowerCase()] || codeToken.lang.toLowerCase())
        : "";

      const chunks = lang
        ? shikiToChunks(codeToken.text, lang)
        : [{ __isChunk: true, text: codeToken.text, fg: RGBA.fromHex(themeColors.fg) } as TextChunk];

      const styledText = new StyledText(chunks as any);
      const codeText = new TextRenderable(renderer, {
        content: styledText,
        bg: themeColors.codeBg,
      });

      const wrapper = new BoxRenderable(renderer, {
        backgroundColor: themeColors.codeBg,
        padding: 1,
        marginTop: 1,
        marginBottom: 1,
      });
      wrapper.add(codeText);
      return wrapper;
    }

    // Handle horizontal rules
    if (token.type === "hr") {
      return renderHorizontalRule();
    }

    // Handle blockquotes
    if (token.type === "blockquote") {
      return renderBlockquote(token as Token & { tokens?: Token[] });
    }

    // Handle lists with proper indentation
    if (token.type === "list") {
      return renderList(token as ListToken);
    }

    // Handle tables
    if (token.type === "table") {
      return renderTable(token as TableToken);
    }

    // Handle paragraphs with inline HTML or escape sequences
    if (token.type === "paragraph") {
      const para = token as ParagraphToken;
      // Check if paragraph contains inline HTML, escape tokens, or links
      const hasInlineHtml = para.tokens?.some(t => t.type === "html" && !(t as any).block);
      const hasEscapes = para.tokens?.some(t => t.type === "escape");
      const hasLinks = para.tokens?.some(t => t.type === "link");
      if (hasInlineHtml || hasEscapes || hasLinks) {
        const rendered = renderParagraph(para);
        if (rendered) return rendered;
      }
    }

    // Handle HTML blocks
    if (token.type === "html") {
      const htmlToken = token as Token & { raw: string; block?: boolean };
      const html = htmlToken.raw;

      // Block-level HTML
      if (htmlToken.block) {
        const rendered = renderHtmlBlock(html);
        if (rendered) return rendered;
        return new BoxRenderable(renderer, {});
      }

      // Inline HTML - return null to let paragraph handler deal with it
      return null;
    }

    // Hide link definitions (they should not be displayed)
    if (token.type === "def") {
      return new BoxRenderable(renderer, {}); // Empty, hidden
    }

    return null;
  },
});
scrollBox.add(markdown);

// Status bar
const fileName = filePath === "-" ? "stdin" : basename(filePath);
const statusBar = new BoxRenderable(renderer, {
  id: "statusbar",
  flexDirection: "row",
  paddingLeft: 1,
  paddingRight: 1,
  height: 1,
  flexShrink: 0,
  backgroundColor: themeColors.codeBg,
});

statusBar.add(new TextRenderable(renderer, {
  id: "filename",
  content: fileName,
  fg: themeColors.link,
  attributes: TextAttributes.BOLD,
}));

const helpText = new TextRenderable(renderer, {
  id: "help",
  content: "  j/k scroll | V visual | yy yank all | q quit",
  fg: themeColors.gray,
});
statusBar.add(helpText);

// Assemble UI
container.add(scrollBox);
container.add(statusBar);
renderer.root.add(container);

// =============================================================================
// Keyboard Handling
// =============================================================================

let lastKey = "";
let lastKeyTime = 0;

// Visual mode state
type Mode = "normal" | "visual";
let mode: Mode = "normal";
let visualStart = 0; // Line number where visual mode started
let visualEnd = 0;   // Current line in visual mode

// Split content into lines for visual selection
const contentLines = content.split("\n");

// Helper to copy text to clipboard
function copyToClipboard(text: string) {
  const proc = Bun.spawn(["pbcopy"], {
    stdin: new Blob([text]),
  });
  return proc.exited;
}

// Helper to get selected lines in visual mode
function getSelectedContent(): string {
  const start = Math.min(visualStart, visualEnd);
  const end = Math.max(visualStart, visualEnd);
  return contentLines.slice(start, end + 1).join("\n");
}

// Notification timeout handle
let notificationTimeout: ReturnType<typeof setTimeout> | null = null;

// Show a temporary notification in the status bar
function showNotification(message: string, durationMs: number = 2000) {
  // Clear any existing notification timeout
  if (notificationTimeout) {
    clearTimeout(notificationTimeout);
  }

  // Show notification
  helpText.content = `  ${message}`;
  helpText.fg = themeColors.green;

  // Revert after duration
  notificationTimeout = setTimeout(() => {
    helpText.fg = themeColors.gray;
    updateStatusBar();
    notificationTimeout = null;
  }, durationMs);
}

// Update status bar based on mode
function updateStatusBar() {
  if (mode === "visual") {
    const lines = Math.abs(visualEnd - visualStart) + 1;
    const startLine = Math.min(visualStart, visualEnd) + 1;
    const endLine = Math.max(visualStart, visualEnd) + 1;
    helpText.content = `  -- VISUAL -- L${startLine}-${endLine} (${lines} line${lines > 1 ? "s" : ""}) | y yank | Esc cancel`;
    helpText.fg = themeColors.yellow;
  } else {
    helpText.content = "  j/k gg/G scroll | Ctrl-d/u half | V visual | yy yank | q quit";
    helpText.fg = themeColors.gray;
  }
}

// Convert scroll position to approximate line number
function scrollToLine(): number {
  const scrollRatio = scrollBox.scrollTop / Math.max(scrollBox.scrollHeight, 1);
  return Math.floor(scrollRatio * contentLines.length);
}

// Enter visual mode
function enterVisualMode(startLine?: number) {
  mode = "visual";
  visualStart = startLine ?? scrollToLine();
  visualEnd = visualStart;
  updateStatusBar();
}

// Exit visual mode
function exitVisualMode() {
  mode = "normal";
  updateStatusBar();
}

renderer.keyInput.on("keypress", (event: KeyEvent) => {
  const now = Date.now();
  const height = renderer.height;

  // Handle Escape - exit visual mode
  if (event.name === "escape") {
    if (mode === "visual") {
      exitVisualMode();
    }
    lastKey = "";
    return;
  }

  // Handle V - enter visual line mode (Shift+V)
  if (mode === "normal" && (event.name === "V" || (event.name === "v" && event.shift))) {
    enterVisualMode();
    lastKey = "";
    return;
  }

  // Handle y in visual mode - yank selection
  if (event.name === "y" && mode === "visual") {
    const lines = Math.abs(visualEnd - visualStart) + 1;
    const selectedText = getSelectedContent();
    copyToClipboard(selectedText).then(() => {
      showNotification(`Yanked ${lines} line${lines > 1 ? "s" : ""} to clipboard`);
    });
    exitVisualMode();
    lastKey = "";
    return;
  }

  // gg - go to top
  if (event.name === "g" && !event.ctrl && !event.shift) {
    if (lastKey === "g" && now - lastKeyTime < 500) {
      scrollBox.scrollTo(0);
      if (mode === "visual") {
        visualEnd = 0;
        updateStatusBar();
      }
      lastKey = "";
    } else {
      lastKey = "g";
      lastKeyTime = now;
    }
    return;
  }

  // yy - yank (copy) entire document to clipboard (normal mode only)
  if (event.name === "y" && !event.ctrl && !event.shift && mode === "normal") {
    if (lastKey === "y" && now - lastKeyTime < 500) {
      copyToClipboard(content).then(() => {
        showNotification(`Yanked entire document (${contentLines.length} lines) to clipboard`);
      });
      lastKey = "";
    } else {
      lastKey = "y";
      lastKeyTime = now;
    }
    return;
  }

  // G - go to bottom
  if (event.name === "G" || (event.name === "g" && event.shift)) {
    scrollBox.scrollTo(scrollBox.scrollHeight);
    if (mode === "visual") {
      visualEnd = contentLines.length - 1;
      updateStatusBar();
    }
    return;
  }

  lastKey = "";

  switch (event.name) {
    case "q":
      renderer.destroy();
      process.exit(0);

    case "c":
      if (event.ctrl) {
        renderer.destroy();
        process.exit(0);
      }
      break;

    case "j":
    case "down":
      scrollBox.scrollBy(1);
      if (mode === "visual") {
        visualEnd = Math.min(visualEnd + 1, contentLines.length - 1);
        updateStatusBar();
      }
      break;

    case "k":
    case "up":
      scrollBox.scrollBy(-1);
      if (mode === "visual") {
        visualEnd = Math.max(visualEnd - 1, 0);
        updateStatusBar();
      }
      break;

    case "d":
      if (event.ctrl) {
        scrollBox.scrollBy(Math.floor(height / 2));
        if (mode === "visual") {
          visualEnd = Math.min(visualEnd + Math.floor(height / 2), contentLines.length - 1);
          updateStatusBar();
        }
      }
      break;

    case "u":
      if (event.ctrl) {
        scrollBox.scrollBy(-Math.floor(height / 2));
        if (mode === "visual") {
          visualEnd = Math.max(visualEnd - Math.floor(height / 2), 0);
          updateStatusBar();
        }
      }
      break;

    case "f":
      if (event.ctrl) {
        scrollBox.scrollBy(height - 2);
        if (mode === "visual") {
          visualEnd = Math.min(visualEnd + height - 2, contentLines.length - 1);
          updateStatusBar();
        }
      }
      break;

    case "b":
      if (event.ctrl) {
        scrollBox.scrollBy(-(height - 2));
        if (mode === "visual") {
          visualEnd = Math.max(visualEnd - (height - 2), 0);
          updateStatusBar();
        }
      }
      break;

    case "pagedown":
    case "space":
      scrollBox.scrollBy(height - 2);
      if (mode === "visual") {
        visualEnd = Math.min(visualEnd + height - 2, contentLines.length - 1);
        updateStatusBar();
      }
      break;

    case "pageup":
      scrollBox.scrollBy(-(height - 2));
      if (mode === "visual") {
        visualEnd = Math.max(visualEnd - (height - 2), 0);
        updateStatusBar();
      }
      break;

    case "home":
      scrollBox.scrollTo(0);
      if (mode === "visual") {
        visualEnd = 0;
        updateStatusBar();
      }
      break;

    case "end":
      scrollBox.scrollTo(scrollBox.scrollHeight);
      if (mode === "visual") {
        visualEnd = contentLines.length - 1;
        updateStatusBar();
      }
      break;
  }
});
