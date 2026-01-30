/**
 * Document data structure for efficient markdown viewing
 */

import { lexer, type Token, type Tokens } from "marked";

export interface Block {
  token: Token;
  startLine: number;
  lineCount: number;
}

export interface Heading {
  blockIndex: number;
  depth: number;
  text: string;
}

export interface Document {
  blocks: Block[];
  headings: Heading[];
  totalLines: number;
}

export function createDocument(content: string, width: number): Document {
  const blocks = parseBlocks(content);
  computeLinePositions(blocks, width);

  const headings: Heading[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const token = blocks[i].token;
    if (token.type === "heading") {
      headings.push({
        blockIndex: i,
        depth: (token as Tokens.Heading).depth,
        text: (token as Tokens.Heading).text,
      });
    }
  }

  const totalLines = blocks.length > 0
    ? blocks[blocks.length - 1].startLine + blocks[blocks.length - 1].lineCount
    : 0;

  return { blocks, headings, totalLines };
}

export function parseBlocks(content: string): Block[] {
  if (!content) return [];

  const tokens = lexer(content);
  const blocks: Block[] = [];

  for (const token of tokens) {
    // Filter out space tokens
    if (token.type === "space") continue;

    blocks.push({
      token,
      startLine: 0,
      lineCount: 0,
    });
  }

  return blocks;
}

export function computeLinePositions(blocks: Block[], width: number): void {
  let currentLine = 0;

  for (const block of blocks) {
    block.startLine = currentLine;
    block.lineCount = computeBlockLineCount(block.token, width);
    currentLine += block.lineCount;
  }
}

function computeBlockLineCount(token: Token, width: number): number {
  switch (token.type) {
    case "heading":
      return computeWrappedLines((token as Tokens.Heading).text, width);

    case "paragraph":
      return computeWrappedLines((token as Tokens.Paragraph).text, width);

    case "code": {
      const code = token as Tokens.Code;
      // Count newlines in code text
      return code.text.split("\n").length;
    }

    case "blockquote": {
      const bq = token as Tokens.Blockquote;
      // Recursively count lines in blockquote content
      let lines = 0;
      if (bq.tokens) {
        for (const t of bq.tokens) {
          lines += computeBlockLineCount(t, width - 2); // Account for "> " prefix
        }
      }
      return Math.max(1, lines);
    }

    case "list": {
      const list = token as Tokens.List;
      return list.items.length;
    }

    case "hr":
      return 1;

    case "html":
      // Count newlines in HTML
      return (token as Tokens.HTML).raw.split("\n").filter(l => l.trim()).length || 1;

    case "table": {
      const table = token as Tokens.Table;
      // Header + rows
      return 1 + table.rows.length;
    }

    default:
      return 1;
  }
}

function computeWrappedLines(text: string, width: number): number {
  if (!text || width <= 0) return 1;
  // Simple word wrap estimation
  return Math.max(1, Math.ceil(text.length / width));
}

export function findBlockAtLine(doc: Document, line: number): number {
  if (doc.blocks.length === 0) return -1;

  // Binary search
  let lo = 0;
  let hi = doc.blocks.length - 1;

  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (doc.blocks[mid].startLine <= line) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  return lo;
}

export function getVisibleBlocks(
  doc: Document,
  startLine: number,
  viewportHeight: number
): Block[] {
  if (doc.blocks.length === 0) return [];

  const firstIdx = findBlockAtLine(doc, startLine);
  if (firstIdx === -1) return [];

  const endLine = startLine + viewportHeight;
  const visible: Block[] = [];

  for (let i = firstIdx; i < doc.blocks.length; i++) {
    const block = doc.blocks[i];
    // Block starts after viewport ends
    if (block.startLine >= endLine) break;
    visible.push(block);
  }

  return visible;
}

// --- Streaming Document Support ---

export interface StreamingDocument {
  document: Document;
  isComplete: boolean;
  append(content: string): void;
  finalize(): void;
}

export function createStreamingDocument(width: number): StreamingDocument {
  const document: Document = {
    blocks: [],
    headings: [],
    totalLines: 0,
  };

  let buffer = "";
  let isComplete = false;

  function processBuffer(force: boolean): void {
    if (!buffer) return;

    // Try to find complete blocks
    // A block is complete if followed by a blank line or EOF
    const content = force ? buffer : findCompleteContent(buffer);
    if (!content) return;

    const newBlocks = parseBlocks(content);
    if (newBlocks.length === 0) return;

    // Compute line positions starting from current total
    const startLine = document.totalLines;
    let currentLine = startLine;

    for (const block of newBlocks) {
      block.startLine = currentLine;
      block.lineCount = computeBlockLineCount(block.token, width);
      currentLine += block.lineCount;

      // Track headings
      if (block.token.type === "heading") {
        document.headings.push({
          blockIndex: document.blocks.length,
          depth: (block.token as Tokens.Heading).depth,
          text: (block.token as Tokens.Heading).text,
        });
      }

      document.blocks.push(block);
    }

    document.totalLines = currentLine;

    // Update buffer - remove processed content
    if (force) {
      buffer = "";
    } else {
      buffer = buffer.slice(content.length);
    }
  }

  return {
    get document() {
      return document;
    },
    get isComplete() {
      return isComplete;
    },
    append(content: string): void {
      buffer += content;
      processBuffer(false);
    },
    finalize(): void {
      processBuffer(true);
      isComplete = true;
    },
  };
}

/**
 * Find content that contains complete blocks.
 * A block is considered complete when followed by a blank line.
 */
function findCompleteContent(buffer: string): string {
  // Look for the last double newline (blank line between blocks)
  const lastBlankLine = buffer.lastIndexOf("\n\n");
  if (lastBlankLine === -1) return "";

  // Include content up to and including the blank line
  return buffer.slice(0, lastBlankLine + 2);
}
