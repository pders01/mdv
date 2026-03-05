/**
 * Search state management for pager-style / search
 *
 * Tracks search pattern, match positions, and navigation.
 */

/**
 * Strip markdown inline syntax to approximate what the renderer displays after
 * conceal. This makes search column offsets match the rendered output.
 *
 * Handles: links, images, bold/italic, strikethrough, code spans, headings.
 */
export function stripMarkdownInline(line: string): string {
  let s = line;

  // Headings: "## Foo" → "Foo"
  s = s.replace(/^(#{1,6})\s+/, "");

  // Images: ![alt](url) → alt
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");

  // Links: [text](url) → text
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");

  // Bold/italic (*-based only — underscore variants like __tests__ are too
  // ambiguous with code identifiers and would corrupt column offsets)
  s = s.replace(/\*{3}(.+?)\*{3}/g, "$1");
  s = s.replace(/\*{2}(.+?)\*{2}/g, "$1");
  s = s.replace(/\*(.+?)\*/g, "$1");

  // Strikethrough: ~~text~~ → text
  s = s.replace(/~~(.+?)~~/g, "$1");

  // Inline code: `code` → code
  s = s.replace(/`([^`]+)`/g, "$1");

  return s;
}

export interface SearchMatch {
  line: number;
  col: number;
  length: number;
}

export class SearchManager {
  private _isInputActive = false;
  private _inputBuffer = "";
  private _pattern = "";
  private _matches: SearchMatch[] = [];
  private _currentIndex = -1;

  get isInputActive(): boolean {
    return this._isInputActive;
  }

  get inputBuffer(): string {
    return this._inputBuffer;
  }

  get pattern(): string {
    return this._pattern;
  }

  get matches(): ReadonlyArray<SearchMatch> {
    return this._matches;
  }

  get currentIndex(): number {
    return this._currentIndex;
  }

  get currentMatch(): SearchMatch | null {
    if (this._currentIndex < 0 || this._currentIndex >= this._matches.length) return null;
    return this._matches[this._currentIndex]!;
  }

  get matchCount(): number {
    return this._matches.length;
  }

  startInput(): void {
    this._isInputActive = true;
    this._inputBuffer = "";
  }

  appendChar(ch: string): void {
    this._inputBuffer += ch;
  }

  deleteChar(): void {
    this._inputBuffer = this._inputBuffer.slice(0, -1);
  }

  cancelInput(): void {
    this._isInputActive = false;
    this._inputBuffer = "";
  }

  /**
   * Confirm search input. Returns true if matches were found.
   */
  confirm(lines: string[]): boolean {
    this._isInputActive = false;
    this._pattern = this._inputBuffer;
    this._inputBuffer = "";

    if (!this._pattern) {
      this._matches = [];
      this._currentIndex = -1;
      return false;
    }

    this.findMatches(lines);
    return this._matches.length > 0;
  }

  /**
   * Clear search state entirely
   */
  clear(): void {
    this._isInputActive = false;
    this._inputBuffer = "";
    this._pattern = "";
    this._matches = [];
    this._currentIndex = -1;
  }

  /**
   * Re-search with current pattern on new content
   */
  refresh(lines: string[]): void {
    if (!this._pattern) return;
    this.findMatches(lines);
  }

  /**
   * Advance to next match (wraps around). Returns match line or -1.
   */
  nextMatch(): number {
    if (this._matches.length === 0) return -1;

    this._currentIndex = (this._currentIndex + 1) % this._matches.length;
    return this._matches[this._currentIndex]!.line;
  }

  /**
   * Go to previous match (wraps around). Returns match line or -1.
   */
  prevMatch(): number {
    if (this._matches.length === 0) return -1;

    this._currentIndex = (this._currentIndex - 1 + this._matches.length) % this._matches.length;
    return this._matches[this._currentIndex]!.line;
  }

  /**
   * Jump to the first match at or after the given line (used after confirm).
   */
  firstMatchFrom(fromLine: number): number {
    if (this._matches.length === 0) return -1;

    for (let i = 0; i < this._matches.length; i++) {
      if (this._matches[i]!.line >= fromLine) {
        this._currentIndex = i;
        return this._matches[i]!.line;
      }
    }

    // Wrap around
    this._currentIndex = 0;
    return this._matches[0]!.line;
  }

  private findMatches(lines: string[]): void {
    this._matches = [];
    this._currentIndex = -1;

    if (!this._pattern) return;

    const lowerPattern = this._pattern.toLowerCase();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      // Search the stripped (conceal-simulated) text so column offsets
      // match what the renderer actually displays.
      const stripped = stripMarkdownInline(line);
      const lowerLine = stripped.toLowerCase();
      let col = 0;

      while (true) {
        const idx = lowerLine.indexOf(lowerPattern, col);
        if (idx === -1) break;
        this._matches.push({ line: i, col: idx, length: this._pattern.length });
        col = idx + 1;
      }
    }
  }
}
