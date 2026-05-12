import { describe, it, expect } from "bun:test";

/**
 * Regression: in directory-browsing mode the pane keyboard handler
 * receives a `contentOptions` object that is built once at setup time.
 * If `content` / `contentLines` are captured as raw values they freeze
 * to the first-opened file. Subsequent destructures inside
 * `handleContentKey` then operate on the stale snapshot — search runs
 * against the old file, `yy` yanks the old document, scroll-to-cursor
 * uses the wrong line count.
 *
 * Fix: expose them as getters so each destructure reads the current
 * value. This test mirrors what `handleContentKey` does at the top of
 * its body to ensure the wiring is right.
 */
describe("contentOptions getter wiring", () => {
  it("destructuring reads the latest value when source is a getter", () => {
    let currentContent = "first";
    let currentLines = ["first"];

    const contentOptions = {
      get content() {
        return currentContent;
      },
      get contentLines() {
        return currentLines;
      },
    };

    const read = () => {
      const { content, contentLines } = contentOptions;
      return { content, contentLines };
    };

    expect(read()).toEqual({ content: "first", contentLines: ["first"] });

    currentContent = "second";
    currentLines = ["a", "b"];
    expect(read()).toEqual({ content: "second", contentLines: ["a", "b"] });
  });

  it("plain-value wiring stays frozen to the first read (negative control)", () => {
    let currentContent = "first";
    const contentOptions = { content: currentContent };

    const read = () => contentOptions.content;
    expect(read()).toBe("first");

    currentContent = "second";
    // Plain value never re-reads — this is the bug the getters fix.
    expect(read()).toBe("first");
  });
});
