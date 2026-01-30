import { describe, it, expect } from "bun:test";
import {
  createViewer,
  type Viewer,
  type ViewerOptions,
} from "./viewer";

describe("Viewer", () => {
  const defaultOptions: ViewerOptions = {
    width: 80,
    height: 24,
  };

  describe("creation", () => {
    it("creates viewer from content", () => {
      const viewer = createViewer("# Hello", defaultOptions);
      expect(viewer).toBeDefined();
      expect(viewer.totalLines).toBeGreaterThan(0);
    });

    it("creates empty viewer from empty content", () => {
      const viewer = createViewer("", defaultOptions);
      expect(viewer.totalLines).toBe(0);
    });

    it("exposes document headings for TOC", () => {
      const content = "# H1\n\n## H2\n\n### H3";
      const viewer = createViewer(content, defaultOptions);
      expect(viewer.headings).toHaveLength(3);
      expect(viewer.headings[0].text).toBe("H1");
      expect(viewer.headings[0].depth).toBe(1);
    });
  });

  describe("scrolling", () => {
    it("starts at scroll position 0", () => {
      const viewer = createViewer("# Hello", defaultOptions);
      expect(viewer.scrollPosition).toBe(0);
    });

    it("scrolls down", () => {
      const content = Array.from({ length: 50 }, (_, i) => `Line ${i}`).join("\n\n");
      const viewer = createViewer(content, defaultOptions);
      viewer.scrollBy(5);
      expect(viewer.scrollPosition).toBe(5);
    });

    it("scrolls up", () => {
      const content = Array.from({ length: 50 }, (_, i) => `Line ${i}`).join("\n\n");
      const viewer = createViewer(content, defaultOptions);
      viewer.scrollBy(10);
      viewer.scrollBy(-3);
      expect(viewer.scrollPosition).toBe(7);
    });

    it("clamps scroll to bounds (no negative)", () => {
      const viewer = createViewer("# Hello", defaultOptions);
      viewer.scrollBy(-100);
      expect(viewer.scrollPosition).toBe(0);
    });

    it("clamps scroll to max", () => {
      const content = "# Hello\n\nWorld";
      const viewer = createViewer(content, defaultOptions);
      viewer.scrollBy(1000);
      expect(viewer.scrollPosition).toBeLessThanOrEqual(viewer.totalLines);
    });

    it("scrollTo jumps to specific line", () => {
      const content = Array.from({ length: 50 }, (_, i) => `Line ${i}`).join("\n\n");
      const viewer = createViewer(content, defaultOptions);
      viewer.scrollTo(20);
      expect(viewer.scrollPosition).toBe(20);
    });

    it("scrollToHeading jumps to heading", () => {
      // Need enough content to scroll
      const content = "# First\n\n" + "Paragraph\n\n".repeat(20) + "## Second\n\nMore text";
      const viewer = createViewer(content, { width: 80, height: 10 });
      viewer.scrollToHeading(1); // Second heading (index 1)
      expect(viewer.scrollPosition).toBeGreaterThan(0);
    });
  });

  describe("rendering", () => {
    it("returns rendered lines for viewport", () => {
      const viewer = createViewer("# Hello\n\nWorld", defaultOptions);
      const lines = viewer.render();
      expect(lines.length).toBeGreaterThan(0);
    });

    it("renders at most viewport height lines", () => {
      const content = Array.from({ length: 100 }, (_, i) => `# Heading ${i}`).join("\n\n");
      const viewer = createViewer(content, { width: 80, height: 10 });
      const lines = viewer.render();
      expect(lines.length).toBeLessThanOrEqual(10);
    });

    it("renders different content after scroll", () => {
      const content = Array.from({ length: 50 }, (_, i) => `# Heading ${i}`).join("\n\n");
      const viewer = createViewer(content, { width: 80, height: 5 });

      const before = viewer.render();
      viewer.scrollTo(20);
      const after = viewer.render();

      // Should be different content
      expect(before[0]).not.toEqual(after[0]);
    });

    it("returns ANSI-formatted strings", () => {
      const viewer = createViewer("# Hello", defaultOptions);
      const lines = viewer.render();
      // Should contain ANSI escape codes for styling
      expect(lines[0]).toMatch(/\x1b\[/);
    });
  });

  describe("resize", () => {
    it("recomputes on resize", () => {
      const longText = "word ".repeat(50);
      const viewer = createViewer(longText, { width: 80, height: 24 });
      const linesBefore = viewer.totalLines;

      viewer.resize(40, 24);
      const linesAfter = viewer.totalLines;

      // Narrower width should mean more lines
      expect(linesAfter).toBeGreaterThan(linesBefore);
    });

    it("preserves relative scroll position on resize", () => {
      const content = Array.from({ length: 100 }, (_, i) => `Line ${i}`).join("\n\n");
      const viewer = createViewer(content, { width: 80, height: 24 });

      // Scroll to middle
      viewer.scrollTo(50);
      const ratio = viewer.scrollPosition / viewer.totalLines;

      viewer.resize(40, 24);

      // Should be roughly same position relative to total
      const newRatio = viewer.scrollPosition / viewer.totalLines;
      expect(Math.abs(newRatio - ratio)).toBeLessThan(0.1);
    });
  });

  describe("streaming", () => {
    it("supports appending content", () => {
      const viewer = createViewer("", defaultOptions, { streaming: true });
      expect(viewer.totalLines).toBe(0);

      viewer.append("# Hello\n\n");
      expect(viewer.totalLines).toBeGreaterThan(0);
    });

    it("updates headings on append", () => {
      const viewer = createViewer("", defaultOptions, { streaming: true });
      viewer.append("# First\n\n");
      expect(viewer.headings).toHaveLength(1);

      viewer.append("## Second\n\n");
      expect(viewer.headings).toHaveLength(2);
    });

    it("finalizes streaming content", () => {
      const viewer = createViewer("", defaultOptions, { streaming: true });
      viewer.append("# Hello");
      viewer.finalize();
      expect(viewer.totalLines).toBeGreaterThan(0);
    });
  });
});
