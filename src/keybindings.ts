/**
 * Keybindings handler - extracted for testability
 */

export interface ScrollTarget {
  scrollBy(delta: number): void;
  scrollTo(position: number): void;
  scrollHeight: number;
}

export interface KeyEvent {
  name: string;
  ctrl?: boolean;
  shift?: boolean;
  meta?: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

export interface KeybindingsOptions {
  viewportHeight: number;
  onQuit: () => void;
}

export interface KeybindingsState {
  lastKey: string;
  lastKeyTime: number;
}

export function createKeybindingsHandler(
  getScrollTarget: () => ScrollTarget | null | undefined,
  options: KeybindingsOptions
) {
  const state: KeybindingsState = {
    lastKey: "",
    lastKeyTime: 0,
  };

  return function handleKeypress(event: KeyEvent): boolean {
    const target = getScrollTarget();
    const now = Date.now();
    const { viewportHeight, onQuit } = options;

    // Prevent default to stop other handlers
    event.preventDefault();

    // Handle gg (go to top) - two g's within 500ms
    if (event.name === "g" && !event.ctrl) {
      if (state.lastKey === "g" && now - state.lastKeyTime < 500) {
        target?.scrollTo(0);
        state.lastKey = "";
        return true;
      }
      state.lastKey = "g";
      state.lastKeyTime = now;
      return true;
    }

    state.lastKey = "";

    switch (event.name) {
      case "q":
        onQuit();
        return true;

      case "j":
      case "down":
        target?.scrollBy(1);
        return true;

      case "k":
      case "up":
        target?.scrollBy(-1);
        return true;

      case "d":
        if (event.ctrl) {
          target?.scrollBy(Math.floor(viewportHeight / 2));
          return true;
        }
        break;

      case "u":
        if (event.ctrl) {
          target?.scrollBy(-Math.floor(viewportHeight / 2));
          return true;
        }
        break;

      case "f":
        if (event.ctrl) {
          target?.scrollBy(viewportHeight - 2);
          return true;
        }
        break;

      case "b":
        if (event.ctrl) {
          target?.scrollBy(-(viewportHeight - 2));
          return true;
        }
        break;

      case "G":
        if (target) {
          target.scrollTo(target.scrollHeight);
        }
        return true;

      case "pagedown":
      case "space":
        target?.scrollBy(viewportHeight - 2);
        return true;

      case "pageup":
        target?.scrollBy(-(viewportHeight - 2));
        return true;

      case "home":
        target?.scrollTo(0);
        return true;

      case "end":
        if (target) {
          target.scrollTo(target.scrollHeight);
        }
        return true;
    }

    return false;
  };
}
