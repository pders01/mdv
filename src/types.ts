/**
 * Shared type definitions for mdv
 */

import type { Token } from "marked";
import type { RGBA } from "@opentui/core";

// =============================================================================
// Highlighting Types
// =============================================================================

/**
 * Text chunk for syntax-highlighted code
 */
export interface TextChunk {
  __isChunk: true;
  text: string;
  fg?: typeof RGBA.prototype;
  bold?: boolean;
  italic?: boolean;
}

// =============================================================================
// Token Types
// =============================================================================

/**
 * Inline text token
 */
export interface TextToken extends Token {
  type: "text";
  text: string;
}

/**
 * Escape sequence token
 */
export interface EscapeToken extends Token {
  type: "escape";
  text: string;
}

/**
 * Strong (bold) token
 */
export interface StrongToken extends Token {
  type: "strong";
  text: string;
}

/**
 * Emphasis (italic) token
 */
export interface EmToken extends Token {
  type: "em";
  text: string;
}

/**
 * Code span token
 */
export interface CodespanToken extends Token {
  type: "codespan";
  text: string;
}

/**
 * Link token
 */
export interface LinkToken extends Token {
  type: "link";
  text: string;
  href: string;
  title?: string;
}

/**
 * Deleted text token
 */
export interface DelToken extends Token {
  type: "del";
  text: string;
}

/**
 * HTML token (inline or block)
 */
export interface HtmlToken extends Token {
  type: "html";
  raw: string;
  text: string;
  block: boolean;
  pre: boolean;
}

/**
 * Union of inline token types
 */
export type InlineToken =
  | TextToken
  | EscapeToken
  | StrongToken
  | EmToken
  | CodespanToken
  | LinkToken
  | DelToken;

/**
 * List item within a list token
 */
export interface ListItem {
  type: "list_item";
  text: string;
  tokens?: Token[];
}

/**
 * List token with items
 */
export interface ListToken extends Token {
  ordered: boolean;
  start?: number | string;
  items: ListItem[];
}

/**
 * Paragraph token with inline tokens
 */
export interface ParagraphToken extends Token {
  text: string;
  tokens?: Token[];
}

/**
 * Table token with header and rows
 */
export interface TableToken extends Token {
  header: Array<{ text: string; tokens?: Token[] }>;
  rows: Array<Array<{ text: string; tokens?: Token[] }>>;
  align?: Array<"left" | "center" | "right" | null>;
}

// =============================================================================
// Rendering State Types
// =============================================================================

/**
 * State tracking for inline HTML parsing
 */
export interface InlineHtmlState {
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

/**
 * Styled text segment for paragraph rendering
 */
export interface StyledSegment {
  text: string;
  fg: string;
  bold: boolean;
  italic: boolean;
}

// =============================================================================
// Theme Types
// =============================================================================

/**
 * Theme color palette extracted from Shiki theme
 */
export interface ThemeColors {
  fg: string;
  bg: string;
  link: string;
  red: string;
  orange: string;
  yellow: string;
  green: string;
  cyan: string;
  blue: string;
  purple: string;
  gray: string;
  codeBg: string;
}

// =============================================================================
// Visual Mode Types
// =============================================================================

/**
 * Editor mode
 */
export type Mode = "normal" | "visual";
