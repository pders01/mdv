/**
 * HTML escape helpers used across the server-side renderer and adapters.
 *
 * Two flavors:
 *   - escapeHtml: text node content (& < >)
 *   - escapeAttr: double-quoted attribute values (& < > " ')
 *
 * Single quote is included in escapeAttr so values can be safely embedded
 * in either single- or double-quoted attributes without surprises.
 */

const TEXT_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

const ATTR_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => TEXT_MAP[c]!);
}

export function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ATTR_MAP[c]!);
}
