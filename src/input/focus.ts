/**
 * Pane focus state management
 */

export type Pane = "sidebar" | "content";

export interface FocusManager {
  readonly activePane: Pane;
  switchTo(pane: Pane): void;
  toggle(): void;
  onFocusChange(cb: (pane: Pane) => void): void;
}

export function createFocusManager(initial: Pane = "content"): FocusManager {
  let active: Pane = initial;
  const listeners: Array<(pane: Pane) => void> = [];

  const notify = () => {
    for (const cb of listeners) cb(active);
  };

  return {
    get activePane() {
      return active;
    },
    switchTo(pane: Pane) {
      if (active === pane) return;
      active = pane;
      notify();
    },
    toggle() {
      active = active === "sidebar" ? "content" : "sidebar";
      notify();
    },
    onFocusChange(cb: (pane: Pane) => void) {
      listeners.push(cb);
    },
  };
}
