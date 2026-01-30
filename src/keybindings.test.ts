import { describe, it, expect, beforeEach, mock } from "bun:test";
import {
  createKeybindingsHandler,
  type ScrollTarget,
  type KeyEvent,
} from "./keybindings";

describe("keybindings", () => {
  let scrollTarget: ScrollTarget;
  let onQuit: ReturnType<typeof mock>;
  let handler: ReturnType<typeof createKeybindingsHandler>;
  let preventDefaultCalled: boolean;

  function createEvent(name: string, opts: Partial<KeyEvent> = {}): KeyEvent {
    preventDefaultCalled = false;
    return {
      name,
      ctrl: false,
      shift: false,
      meta: false,
      preventDefault: () => { preventDefaultCalled = true; },
      stopPropagation: () => {},
      ...opts,
    };
  }

  beforeEach(() => {
    scrollTarget = {
      scrollBy: mock(() => {}),
      scrollTo: mock(() => {}),
      scrollHeight: 100,
    };
    onQuit = mock(() => {});
    handler = createKeybindingsHandler(
      () => scrollTarget,
      { viewportHeight: 24, onQuit }
    );
  });

  describe("basic scrolling", () => {
    it("j scrolls down by 1", () => {
      handler(createEvent("j"));
      expect(scrollTarget.scrollBy).toHaveBeenCalledWith(1);
    });

    it("k scrolls up by 1", () => {
      handler(createEvent("k"));
      expect(scrollTarget.scrollBy).toHaveBeenCalledWith(-1);
    });

    it("down arrow scrolls down by 1", () => {
      handler(createEvent("down"));
      expect(scrollTarget.scrollBy).toHaveBeenCalledWith(1);
    });

    it("up arrow scrolls up by 1", () => {
      handler(createEvent("up"));
      expect(scrollTarget.scrollBy).toHaveBeenCalledWith(-1);
    });
  });

  describe("page scrolling", () => {
    it("Ctrl-d scrolls down half page", () => {
      handler(createEvent("d", { ctrl: true }));
      expect(scrollTarget.scrollBy).toHaveBeenCalledWith(12); // 24/2
    });

    it("Ctrl-u scrolls up half page", () => {
      handler(createEvent("u", { ctrl: true }));
      expect(scrollTarget.scrollBy).toHaveBeenCalledWith(-12);
    });

    it("Ctrl-f scrolls down full page", () => {
      handler(createEvent("f", { ctrl: true }));
      expect(scrollTarget.scrollBy).toHaveBeenCalledWith(22); // 24-2
    });

    it("Ctrl-b scrolls up full page", () => {
      handler(createEvent("b", { ctrl: true }));
      expect(scrollTarget.scrollBy).toHaveBeenCalledWith(-22);
    });

    it("pagedown scrolls down full page", () => {
      handler(createEvent("pagedown"));
      expect(scrollTarget.scrollBy).toHaveBeenCalledWith(22);
    });

    it("pageup scrolls up full page", () => {
      handler(createEvent("pageup"));
      expect(scrollTarget.scrollBy).toHaveBeenCalledWith(-22);
    });

    it("space scrolls down full page", () => {
      handler(createEvent("space"));
      expect(scrollTarget.scrollBy).toHaveBeenCalledWith(22);
    });
  });

  describe("jump navigation", () => {
    it("G jumps to bottom", () => {
      handler(createEvent("G"));
      expect(scrollTarget.scrollTo).toHaveBeenCalledWith(100);
    });

    it("gg jumps to top", () => {
      handler(createEvent("g"));
      // First g doesn't scroll
      expect(scrollTarget.scrollTo).not.toHaveBeenCalled();

      // Second g within 500ms scrolls to top
      handler(createEvent("g"));
      expect(scrollTarget.scrollTo).toHaveBeenCalledWith(0);
    });

    it("gg resets after timeout", async () => {
      handler(createEvent("g"));

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 600));

      handler(createEvent("g"));
      // Should not scroll because too much time passed
      expect(scrollTarget.scrollTo).not.toHaveBeenCalled();
    });

    it("home jumps to top", () => {
      handler(createEvent("home"));
      expect(scrollTarget.scrollTo).toHaveBeenCalledWith(0);
    });

    it("end jumps to bottom", () => {
      handler(createEvent("end"));
      expect(scrollTarget.scrollTo).toHaveBeenCalledWith(100);
    });
  });

  describe("quit", () => {
    it("q calls onQuit", () => {
      handler(createEvent("q"));
      expect(onQuit).toHaveBeenCalled();
    });
  });

  describe("preventDefault", () => {
    it("always calls preventDefault", () => {
      handler(createEvent("j"));
      expect(preventDefaultCalled).toBe(true);
    });

    it("calls preventDefault even for unhandled keys", () => {
      handler(createEvent("x"));
      expect(preventDefaultCalled).toBe(true);
    });
  });

  describe("null scroll target", () => {
    it("handles null scroll target gracefully", () => {
      const nullHandler = createKeybindingsHandler(
        () => null,
        { viewportHeight: 24, onQuit }
      );

      // Should not throw
      expect(() => nullHandler(createEvent("j"))).not.toThrow();
      expect(() => nullHandler(createEvent("G"))).not.toThrow();
    });
  });

  describe("d and u without ctrl", () => {
    it("d without ctrl does not scroll", () => {
      handler(createEvent("d", { ctrl: false }));
      expect(scrollTarget.scrollBy).not.toHaveBeenCalled();
    });

    it("u without ctrl does not scroll", () => {
      handler(createEvent("u", { ctrl: false }));
      expect(scrollTarget.scrollBy).not.toHaveBeenCalled();
    });
  });
});
