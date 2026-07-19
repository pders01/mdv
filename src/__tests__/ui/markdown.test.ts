import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import type { MdvRenderNode } from "../../ui/markdown.js";
import { MdvMarkdownRenderable } from "../../ui/markdown.js";

const renderNode: MdvRenderNode = () => ({
  kind: "text",
  chunks: [{ __isChunk: true, text: "block" }],
  source: null,
});

describe("MdvMarkdownRenderable", () => {
  test("rebuild replaces and destroys existing renderable children", async () => {
    const { renderer } = await createTestRenderer({ width: 80, height: 24 });
    const markdown = new MdvMarkdownRenderable(renderer, {
      content: "# Heading\n\nParagraph",
      renderNode,
    });
    const previousChildren = markdown.blockStates.map((state) => state.renderable);

    expect(previousChildren).toHaveLength(2);
    expect(() => markdown.setRenderNode(renderNode)).not.toThrow();
    expect(markdown.getChildrenCount()).toBe(2);
    expect(previousChildren.every((child) => child.isDestroyed)).toBe(true);

    renderer.destroy();
  });
});
