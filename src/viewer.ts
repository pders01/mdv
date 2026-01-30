/**
 * Viewer - integrates document parsing and rendering for the TUI
 */

import {
  createDocument,
  createStreamingDocument,
  computeLinePositions,
  getVisibleBlocks,
  type Document,
  type Heading,
  type Block,
  type StreamingDocument,
} from "./document";
import { renderBlock, type RenderedLine, type StyledSpan, type Style } from "./renderer";

// Re-export types for consumers
export type { RenderedLine, StyledSpan, Style } from "./renderer";

export interface ViewerOptions {
  width: number;
  height: number;
}

export interface StreamingOptions {
  streaming: boolean;
}

export interface Viewer {
  readonly totalLines: number;
  readonly scrollPosition: number;
  readonly headings: Heading[];

  scrollBy(delta: number): void;
  scrollTo(line: number): void;
  scrollToHeading(index: number): void;
  render(): string[];
  renderStructured(): RenderedLine[];
  resize(width: number, height: number): void;

  // Streaming support
  append(content: string): void;
  finalize(): void;
}

export function createViewer(
  content: string,
  options: ViewerOptions,
  streamingOptions?: StreamingOptions
): Viewer {
  let width = options.width;
  let height = options.height;
  let scrollPosition = 0;

  // Use streaming or static document
  const isStreaming = streamingOptions?.streaming ?? false;
  let streamingDoc: StreamingDocument | null = null;
  let staticDoc: Document | null = null;

  if (isStreaming) {
    streamingDoc = createStreamingDocument(width);
    if (content) {
      streamingDoc.append(content);
    }
  } else {
    staticDoc = createDocument(content, width);
  }

  function getDocument(): Document {
    return streamingDoc?.document ?? staticDoc!;
  }

  function clampScroll(pos: number): number {
    const doc = getDocument();
    const maxScroll = Math.max(0, doc.totalLines - height);
    return Math.max(0, Math.min(pos, maxScroll));
  }

  return {
    get totalLines() {
      return getDocument().totalLines;
    },

    get scrollPosition() {
      return scrollPosition;
    },

    get headings() {
      return getDocument().headings;
    },

    scrollBy(delta: number): void {
      scrollPosition = clampScroll(scrollPosition + delta);
    },

    scrollTo(line: number): void {
      scrollPosition = clampScroll(line);
    },

    scrollToHeading(index: number): void {
      const doc = getDocument();
      if (index < 0 || index >= doc.headings.length) return;

      const heading = doc.headings[index];
      const block = doc.blocks[heading.blockIndex];
      scrollPosition = clampScroll(block.startLine);
    },

    render(): string[] {
      const structured = this.renderStructured();
      return structured.map(renderLineToAnsi);
    },

    renderStructured(): RenderedLine[] {
      const doc = getDocument();
      const visibleBlocks = getVisibleBlocks(doc, scrollPosition, height);

      const allLines: RenderedLine[] = [];
      let linesRendered = 0;

      for (const block of visibleBlocks) {
        if (linesRendered >= height) break;

        const rendered = renderBlock(block, { width });

        // Calculate how many lines of this block to skip (if partially scrolled past)
        const blockStart = block.startLine;
        const skipLines = Math.max(0, scrollPosition - blockStart);

        for (let i = skipLines; i < rendered.length && linesRendered < height; i++) {
          allLines.push(rendered[i]);
          linesRendered++;
        }
      }

      // Pad with empty lines if needed
      while (allLines.length < height) {
        allLines.push({ spans: [{ text: "", style: {} }] });
      }

      return allLines;
    },

    resize(newWidth: number, newHeight: number): void {
      // Remember relative position
      const doc = getDocument();
      const ratio = doc.totalLines > 0 ? scrollPosition / doc.totalLines : 0;

      width = newWidth;
      height = newHeight;

      // Recompute line positions
      if (staticDoc) {
        computeLinePositions(staticDoc.blocks, width);
        staticDoc.totalLines = staticDoc.blocks.length > 0
          ? staticDoc.blocks[staticDoc.blocks.length - 1].startLine +
            staticDoc.blocks[staticDoc.blocks.length - 1].lineCount
          : 0;
      }

      // Restore relative position
      const newDoc = getDocument();
      scrollPosition = clampScroll(Math.round(ratio * newDoc.totalLines));
    },

    append(content: string): void {
      if (!streamingDoc) {
        throw new Error("Cannot append to non-streaming viewer");
      }
      streamingDoc.append(content);
    },

    finalize(): void {
      if (!streamingDoc) {
        throw new Error("Cannot finalize non-streaming viewer");
      }
      streamingDoc.finalize();
    },
  };
}

// --- ANSI rendering ---

function renderLineToAnsi(line: RenderedLine): string {
  return line.spans.map(spanToAnsi).join("");
}

function spanToAnsi(span: StyledSpan): string {
  const codes: number[] = [];
  const { style, text } = span;

  // Build ANSI codes
  if (style.bold) codes.push(1);
  if (style.dim) codes.push(2);
  if (style.italic) codes.push(3);
  if (style.underline) codes.push(4);

  if (style.fg) {
    const rgb = hexToRgb(style.fg);
    if (rgb) codes.push(38, 2, rgb.r, rgb.g, rgb.b);
  }

  if (style.bg) {
    const rgb = hexToRgb(style.bg);
    if (rgb) codes.push(48, 2, rgb.r, rgb.g, rgb.b);
  }

  if (codes.length === 0) {
    return text;
  }

  return `\x1b[${codes.join(";")}m${text}\x1b[0m`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return null;

  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}
