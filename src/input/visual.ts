/**
 * Visual mode state management
 */

import type { ScrollBoxRenderable } from "@opentui/core";
import type { Mode } from "../types.js";

/**
 * Visual mode state
 */
export interface VisualModeState {
  mode: Mode;
  visualStart: number;
  visualEnd: number;
}

/**
 * Visual mode manager
 */
export class VisualMode {
  private _mode: Mode = "normal";
  private _visualStart = 0;
  private _visualEnd = 0;
  private contentLines: string[];
  private onUpdate: () => void;

  constructor(contentLines: string[], onUpdate: () => void) {
    this.contentLines = contentLines;
    this.onUpdate = onUpdate;
  }

  get mode(): Mode {
    return this._mode;
  }

  get visualStart(): number {
    return this._visualStart;
  }

  get visualEnd(): number {
    return this._visualEnd;
  }

  set visualEnd(value: number) {
    this._visualEnd = value;
    this.onUpdate();
  }

  /**
   * Convert scroll position to approximate line number
   */
  scrollToLine(scrollBox: ScrollBoxRenderable): number {
    const scrollRatio = scrollBox.scrollTop / Math.max(scrollBox.scrollHeight, 1);
    return Math.floor(scrollRatio * this.contentLines.length);
  }

  /**
   * Enter visual mode
   */
  enter(startLine?: number, scrollBox?: ScrollBoxRenderable) {
    this._mode = "visual";
    this._visualStart = startLine ?? (scrollBox ? this.scrollToLine(scrollBox) : 0);
    this._visualEnd = this._visualStart;
    this.onUpdate();
  }

  /**
   * Exit visual mode
   */
  exit() {
    this._mode = "normal";
    this.onUpdate();
  }

  /**
   * Get selected content in visual mode
   */
  getSelectedContent(): string {
    const start = Math.min(this._visualStart, this._visualEnd);
    const end = Math.max(this._visualStart, this._visualEnd);
    return this.contentLines.slice(start, end + 1).join("\n");
  }

  /**
   * Get the number of selected lines
   */
  getSelectedLineCount(): number {
    return Math.abs(this._visualEnd - this._visualStart) + 1;
  }

  /**
   * Move visual end up
   */
  moveUp(amount: number = 1) {
    if (this._mode === "visual") {
      this._visualEnd = Math.max(this._visualEnd - amount, 0);
      this.onUpdate();
    }
  }

  /**
   * Move visual end down
   */
  moveDown(amount: number = 1) {
    if (this._mode === "visual") {
      this._visualEnd = Math.min(this._visualEnd + amount, this.contentLines.length - 1);
      this.onUpdate();
    }
  }

  /**
   * Move visual end to start
   */
  moveToStart() {
    if (this._mode === "visual") {
      this._visualEnd = 0;
      this.onUpdate();
    }
  }

  /**
   * Move visual end to end
   */
  moveToEnd() {
    if (this._mode === "visual") {
      this._visualEnd = this.contentLines.length - 1;
      this.onUpdate();
    }
  }
}

/**
 * Create a visual mode manager
 */
export function createVisualMode(
  contentLines: string[],
  onUpdate: () => void
): VisualMode {
  return new VisualMode(contentLines, onUpdate);
}
