/**
 * Combinatorial markdown generator for smoke testing
 * Generates markdown strings combining various inline and block elements
 */

export interface MarkdownPermutation {
  markdown: string;
  description: string;
}

export interface PermutationOptions {
  inlineElements?: boolean;
  htmlInline?: boolean;
  blockElements?: boolean;
  nesting?: boolean;
  maxDepth?: number;
}

// Inline markdown formatting variants
const INLINE_ELEMENTS: MarkdownPermutation[] = [
  { markdown: "**bold text**", description: "bold" },
  { markdown: "*italic text*", description: "italic" },
  { markdown: "`inline code`", description: "code span" },
  { markdown: "[link text](http://example.com)", description: "link" },
  { markdown: "~~deleted text~~", description: "strikethrough" },
  { markdown: "**bold *bold-italic***", description: "bold+italic" },
  { markdown: "plain text", description: "plain text" },
];

// Inline HTML formatting variants
const HTML_INLINE_ELEMENTS: MarkdownPermutation[] = [
  { markdown: "<b>bold</b>", description: "html bold" },
  { markdown: "<i>italic</i>", description: "html italic" },
  { markdown: "<code>code</code>", description: "html code" },
  { markdown: '<a href="http://example.com">link</a>', description: "html link" },
  { markdown: "<sub>subscript</sub>", description: "html subscript" },
  { markdown: "<sup>superscript</sup>", description: "html superscript" },
  { markdown: "<mark>highlight</mark>", description: "html mark" },
  { markdown: "<kbd>Ctrl+C</kbd>", description: "html kbd" },
  {
    markdown: "<b>bold <i>bold-italic</i></b>",
    description: "html nested bold+italic",
  },
];

// Block-level elements
const BLOCK_ELEMENTS: MarkdownPermutation[] = [
  { markdown: "A simple paragraph.", description: "paragraph" },
  { markdown: "# Heading 1", description: "heading 1" },
  { markdown: "## Heading 2", description: "heading 2" },
  { markdown: "### Heading 3", description: "heading 3" },
  { markdown: "---", description: "horizontal rule" },
  {
    markdown: "```\ncode block\n```",
    description: "fenced code block",
  },
  {
    markdown: "```javascript\nconst x = 1;\n```",
    description: "code block with language",
  },
  { markdown: "> A blockquote", description: "blockquote" },
  {
    markdown: "| A | B |\n| - | - |\n| 1 | 2 |",
    description: "table",
  },
  {
    markdown: "* Item 1\n* Item 2\n* Item 3",
    description: "unordered list",
  },
  {
    markdown: "1. First\n2. Second\n3. Third",
    description: "ordered list",
  },
];

// Nesting variants
const NESTING_ELEMENTS: MarkdownPermutation[] = [
  {
    markdown: "* Level 1\n    * Level 2\n        * Level 3",
    description: "nested list depth 3",
  },
  {
    markdown: "> Outer\n> > Inner blockquote",
    description: "nested blockquote",
  },
  {
    markdown: "1. Ordered\n    * Unordered child",
    description: "mixed list nesting",
  },
];

// Edge cases
const EDGE_CASES: MarkdownPermutation[] = [
  { markdown: "**", description: "empty bold" },
  { markdown: "``", description: "empty code span" },
  { markdown: "Text with &amp; and &lt; and &gt;", description: "html entities" },
  { markdown: "**bold** and *italic* together", description: "adjacent formatting" },
  {
    markdown: "Line 1\n\nLine 2\n\nLine 3",
    description: "multiple paragraphs",
  },
];

/**
 * Wrap inline content in various block contexts
 */
function wrapInBlocks(inline: MarkdownPermutation): MarkdownPermutation[] {
  return [
    {
      markdown: inline.markdown,
      description: `${inline.description} in paragraph`,
    },
    {
      markdown: `* ${inline.markdown}`,
      description: `${inline.description} in list item`,
    },
    {
      markdown: `> ${inline.markdown}`,
      description: `${inline.description} in blockquote`,
    },
  ];
}

/**
 * Generate markdown permutations for smoke testing
 */
export function* markdownPermutations(
  options: PermutationOptions = {},
): Generator<MarkdownPermutation> {
  const {
    inlineElements = true,
    htmlInline = true,
    blockElements = true,
    nesting = true,
  } = options;

  // Inline elements
  if (inlineElements) {
    for (const elem of INLINE_ELEMENTS) {
      yield elem;
      // Also test each inline in different block contexts
      for (const wrapped of wrapInBlocks(elem)) {
        yield wrapped;
      }
    }
  }

  // HTML inline elements
  if (htmlInline) {
    for (const elem of HTML_INLINE_ELEMENTS) {
      yield elem;
      for (const wrapped of wrapInBlocks(elem)) {
        yield wrapped;
      }
    }
  }

  // Block elements
  if (blockElements) {
    for (const elem of BLOCK_ELEMENTS) {
      yield elem;
    }
  }

  // Nesting variants
  if (nesting) {
    for (const elem of NESTING_ELEMENTS) {
      yield elem;
    }
  }

  // Edge cases (always included)
  for (const elem of EDGE_CASES) {
    yield elem;
  }

  // Combined block permutations: pairs of block elements
  if (blockElements) {
    for (let i = 0; i < BLOCK_ELEMENTS.length; i++) {
      for (let j = i + 1; j < BLOCK_ELEMENTS.length; j++) {
        yield {
          markdown: `${BLOCK_ELEMENTS[i].markdown}\n\n${BLOCK_ELEMENTS[j].markdown}`,
          description: `${BLOCK_ELEMENTS[i].description} + ${BLOCK_ELEMENTS[j].description}`,
        };
      }
    }
  }
}
