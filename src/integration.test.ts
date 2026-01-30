/**
 * Integration tests - simulate OpenTUI event flow
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import { EventEmitter } from "events";
import { createKeybindingsHandler, type KeyEvent, type ScrollTarget } from "./keybindings";

/**
 * Mock KeyHandler that simulates OpenTUI's event system
 */
class MockKeyHandler extends EventEmitter {
  emit(event: string, ...args: any[]): boolean {
    // Simulate OpenTUI's event emission
    return super.emit(event, ...args);
  }
}

/**
 * Mock ScrollBox that simulates OpenTUI's ScrollBox behavior
 */
class MockScrollBox implements ScrollTarget {
  scrollPosition = 0;
  scrollHeight = 1000;

  // Track if ScrollBox's internal handler was called
  internalHandlerCalled = false;

  scrollBy(delta: number): void {
    this.scrollPosition = Math.max(0, Math.min(this.scrollHeight, this.scrollPosition + delta));
  }

  scrollTo(position: number): void {
    this.scrollPosition = Math.max(0, Math.min(this.scrollHeight, position));
  }

  // Simulate ScrollBox's internal key handler
  handleKeyPress(event: KeyEvent): boolean {
    this.internalHandlerCalled = true;

    // ScrollBox might handle these keys internally
    if (event.defaultPrevented) {
      return false; // Don't handle if already prevented
    }

    switch (event.name) {
      case "up":
        this.scrollBy(-1);
        return true;
      case "down":
        this.scrollBy(1);
        return true;
      case "pageup":
        this.scrollBy(-10);
        return true;
      case "pagedown":
        this.scrollBy(10);
        return true;
    }
    return false;
  }
}

describe("integration: keybindings with mock OpenTUI", () => {
  let keyHandler: MockKeyHandler;
  let scrollBox: MockScrollBox;
  let quitCalled: boolean;
  let keybindingsHandler: ReturnType<typeof createKeybindingsHandler>;

  function createMockEvent(name: string, opts: Partial<KeyEvent> = {}): KeyEvent & { defaultPrevented: boolean } {
    let defaultPrevented = false;
    return {
      name,
      ctrl: false,
      shift: false,
      meta: false,
      get defaultPrevented() { return defaultPrevented; },
      preventDefault: () => { defaultPrevented = true; },
      stopPropagation: () => {},
      ...opts,
    } as KeyEvent & { defaultPrevented: boolean };
  }

  beforeEach(() => {
    keyHandler = new MockKeyHandler();
    scrollBox = new MockScrollBox();
    quitCalled = false;

    keybindingsHandler = createKeybindingsHandler(
      () => scrollBox,
      { viewportHeight: 24, onQuit: () => { quitCalled = true; } }
    );

    // Register our handler (simulating what index.ts does)
    keyHandler.on("keypress", keybindingsHandler);
  });

  describe("event flow simulation", () => {
    it("our handler receives keypress events", () => {
      const event = createMockEvent("j");
      keyHandler.emit("keypress", event);

      expect(scrollBox.scrollPosition).toBe(1);
    });

    it("preventDefault stops ScrollBox internal handler", () => {
      const event = createMockEvent("down");

      // Emit to our handler first
      keyHandler.emit("keypress", event);

      // Then simulate ScrollBox's internal handler being called
      scrollBox.handleKeyPress(event);

      // Our handler should have scrolled by 1
      // ScrollBox internal handler should NOT have scrolled (because preventDefault)
      expect(event.defaultPrevented).toBe(true);
      expect(scrollBox.scrollPosition).toBe(1); // Not 2
    });

    it("scroll position updates correctly after multiple keypresses", () => {
      keyHandler.emit("keypress", createMockEvent("j"));
      keyHandler.emit("keypress", createMockEvent("j"));
      keyHandler.emit("keypress", createMockEvent("j"));

      expect(scrollBox.scrollPosition).toBe(3);

      keyHandler.emit("keypress", createMockEvent("k"));
      expect(scrollBox.scrollPosition).toBe(2);
    });

    it("Ctrl-d scrolls half page", () => {
      keyHandler.emit("keypress", createMockEvent("d", { ctrl: true }));
      expect(scrollBox.scrollPosition).toBe(12);
    });

    it("G jumps to bottom", () => {
      keyHandler.emit("keypress", createMockEvent("G"));
      expect(scrollBox.scrollPosition).toBe(1000);
    });

    it("gg sequence jumps to top", () => {
      // First scroll somewhere
      scrollBox.scrollPosition = 500;

      keyHandler.emit("keypress", createMockEvent("g"));
      expect(scrollBox.scrollPosition).toBe(500); // Not changed yet

      keyHandler.emit("keypress", createMockEvent("g"));
      expect(scrollBox.scrollPosition).toBe(0); // Now at top
    });

    it("q triggers quit", () => {
      keyHandler.emit("keypress", createMockEvent("q"));
      expect(quitCalled).toBe(true);
    });
  });

  describe("simulated scrollable content scenario", () => {
    it("keybindings work when scrollHeight > viewport", () => {
      // This simulates the scenario where content is scrollable
      scrollBox.scrollHeight = 1000;

      // All these should work
      keyHandler.emit("keypress", createMockEvent("j"));
      expect(scrollBox.scrollPosition).toBe(1);

      keyHandler.emit("keypress", createMockEvent("G"));
      expect(scrollBox.scrollPosition).toBe(1000);

      keyHandler.emit("keypress", createMockEvent("g"));
      keyHandler.emit("keypress", createMockEvent("g"));
      expect(scrollBox.scrollPosition).toBe(0);
    });

    it("keybindings work with very large content", () => {
      scrollBox.scrollHeight = 100000;

      keyHandler.emit("keypress", createMockEvent("G"));
      expect(scrollBox.scrollPosition).toBe(100000);

      keyHandler.emit("keypress", createMockEvent("d", { ctrl: true }));
      // Should scroll up from bottom, but clamped
      expect(scrollBox.scrollPosition).toBe(100000); // scrollBy adds, so still at max
    });
  });
});

describe("integration: multiple handlers scenario", () => {
  it("our handler runs before ScrollBox internal handler", () => {
    const keyHandler = new MockKeyHandler();
    const scrollBox = new MockScrollBox();
    const callOrder: string[] = [];

    // Our handler
    keyHandler.on("keypress", (event: KeyEvent) => {
      callOrder.push("our-handler");
      event.preventDefault();
      scrollBox.scrollBy(1);
    });

    // Simulate ScrollBox registering its own handler
    keyHandler.on("keypress", (event: KeyEvent & { defaultPrevented?: boolean }) => {
      callOrder.push("scrollbox-handler");
      if (!event.defaultPrevented) {
        scrollBox.scrollBy(100); // Would scroll a lot if not prevented
      }
    });

    const event = {
      name: "j",
      ctrl: false,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() {},
    };

    keyHandler.emit("keypress", event);

    expect(callOrder).toEqual(["our-handler", "scrollbox-handler"]);
    expect(scrollBox.scrollPosition).toBe(1); // Only our scroll, not ScrollBox's
  });
});
