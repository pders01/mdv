import { describe, it, expect } from "bun:test";
import { createViewer } from "./viewer";
import { createDocument } from "./document";
import { renderBlock } from "./renderer";

describe("e2e: full rendering pipeline", () => {
  const fixture = `# Markdown Headings Test

# Heading 1

## Heading 2

### Heading 3

#### Heading 4

##### Heading 5

###### Heading 6

Setext H1
=========

Setext H2
---------`;

  it("document parses all headings", () => {
    const doc = createDocument(fixture, 80);
    console.log("Blocks:", doc.blocks.map(b => ({ type: b.token.type, startLine: b.startLine, lineCount: b.lineCount })));
    console.log("Headings:", doc.headings);

    expect(doc.headings.length).toBe(9); // 6 atx + 1 title + 2 setext
  });

  it("each block renders to separate lines", () => {
    const doc = createDocument(fixture, 80);

    for (const block of doc.blocks) {
      const rendered = renderBlock(block, { width: 80 });
      console.log(`Block ${block.token.type}:`, rendered.map(l => l.spans.map(s => s.text).join('')));

      // Each block should render to at least one line
      expect(rendered.length).toBeGreaterThan(0);

      // Lines should have content
      for (const line of rendered) {
        expect(line.spans.length).toBeGreaterThan(0);
      }
    }
  });

  it("viewer renderStructured produces correct line count", () => {
    const viewer = createViewer(fixture, { width: 80, height: 50 });
    const lines = viewer.renderStructured();

    console.log("Total lines from viewer:", lines.length);
    console.log("First 15 lines:");
    for (let i = 0; i < Math.min(15, lines.length); i++) {
      const text = lines[i].spans.map(s => s.text).join('');
      console.log(`  ${i}: "${text}"`);
    }

    // Should have multiple distinct lines
    expect(lines.length).toBeGreaterThan(5);
  });

  it("viewer lines contain expected heading text", () => {
    const viewer = createViewer(fixture, { width: 80, height: 50 });
    const lines = viewer.renderStructured();

    const allText = lines.map(l => l.spans.map(s => s.text).join('')).join('\n');
    console.log("All text:\n", allText);

    expect(allText).toContain("Markdown Headings Test");
    expect(allText).toContain("Heading 1");
    expect(allText).toContain("Heading 2");
    expect(allText).toContain("Heading 6");
    expect(allText).toContain("Setext H1");
    expect(allText).toContain("Setext H2");
  });

  it("each heading is on its own line", () => {
    const viewer = createViewer(fixture, { width: 80, height: 50 });
    const lines = viewer.renderStructured();

    const lineTexts = lines.map(l => l.spans.map(s => s.text).join(''));

    // Find lines containing headings
    const h1Line = lineTexts.find(t => t.includes("Heading 1") && !t.includes("Test"));
    const h2Line = lineTexts.find(t => t.includes("Heading 2"));

    console.log("H1 line:", h1Line);
    console.log("H2 line:", h2Line);

    // These should be separate, non-empty strings
    expect(h1Line).toBeDefined();
    expect(h2Line).toBeDefined();
    expect(h1Line).not.toBe(h2Line);

    // Each should only contain one heading
    expect(h1Line).toBe("Heading 1");
    expect(h2Line).toBe("Heading 2");
  });
});
