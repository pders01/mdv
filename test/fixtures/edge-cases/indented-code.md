# Indented Code Blocks (4-space)

## Basic Indented Code

This is a normal paragraph.

    This is an indented code block.
    It uses 4 spaces of indentation.
    No syntax highlighting expected.

Back to normal text.

## Tab-Indented Code

This paragraph precedes tab-indented code.

    This code uses a tab character.
    Multiple lines with tabs.
    Should render as code.

## Code After List

- List item one
- List item two

  This is a code block after a list.
  It needs a blank line before it.

## Code in List Item

- List item with code:

        function example() {
            return true;
        }

- Another list item

## Multiple Code Blocks

First code block:

    block one
    line two

Some text between.

    block two
    line two

## Comparing Fenced vs Indented

Fenced (with language):

```javascript
const x = 1;
```

Indented (no language):

    const x = 1;

Both should render as code, but fenced gets highlighting.
