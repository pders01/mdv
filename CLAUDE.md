# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

mdv is a terminal markdown viewer with vim-style keybindings. It renders markdown files in the terminal with syntax highlighting, built on OpenTUI (terminal UI framework) and Shiki (syntax highlighting).

## Commands

```bash
# Development
bun dev                          # Run with hot reload
bun run src/index.ts <file.md>   # Run directly

# Build
bun run build                    # Compile standalone binary
bun run install-global           # Build and install to /usr/local/bin

# Testing
bun test                         # Run all tests
bun test src/__tests__/rendering/code.test.ts  # Run single test file

# Linting
bun run lint                     # Run oxlint
bun run lint:fix                 # Run oxlint with auto-fix
```

## Architecture

### Entry Point & CLI

- `src/index.ts` - Main entry, orchestrates all modules and sets up the TUI
- `src/cli.ts` - CLI argument parsing using Node's `util.parseArgs`

### Rendering Pipeline

Custom markdown token renderers in `src/rendering/`:

- `index.ts` - Main dispatcher that routes tokens to specialized renderers
- `code.ts` - Syntax-highlighted code blocks via Shiki
- `paragraph.ts` - Paragraphs with inline HTML/escapes/links
- `list.ts` - Ordered/unordered lists with nesting
- `table.ts` - Table rendering
- `blockquote.ts` - Blockquote rendering
- `html.ts` - HTML blocks and inline HTML handling
- `text.ts` - Text utilities (HTML entities, subscript/superscript)

### Syntax Highlighting

- `src/highlighting/shiki.ts` - Shiki highlighter setup, language aliases, token-to-chunk conversion
- Converts Shiki tokens to OpenTUI `TextChunk` format with colors and styles

### Theme System

- `src/theme/colors.ts` - Extract theme colors from Shiki theme
- `src/theme/syntax.ts` - Create OpenTUI syntax styles from theme colors
- `ThemeColors` type defines the color palette (fg, bg, link, semantic colors)

### Input Handling

- `src/input/cursor.ts` - Cursor state management, scroll logic (uniform line height)
- `src/input/search.ts` - Pager-style `/` search: `SearchManager` state machine, `stripMarkdownInline` for conceal-aware column mapping
- `src/input/keyboard.ts` - Vim keybindings (j/k, gg/G, Ctrl-d/u, yy, V, /, n/N); exports `handleContentKey` for pane dispatch
- `src/input/mouse.ts` - Mouse click-to-position (gap areas), coordinate conversion (`mouseYToLine`)
- `src/input/clipboard.ts` - System clipboard integration (pbcopy/xclip)
- `src/input/focus.ts` - Pane focus state machine (`"sidebar" | "content"`) for directory mode
- `src/input/pane-keyboard.ts` - Key dispatcher that routes input to sidebar or content handler based on active pane

### UI Components

- `src/ui/container.ts` - Main scrollable container, cursor/selection highlighting, code block backgrounds; supports `reloadMarkdown` for directory mode file switching
- `src/ui/statusbar.ts` - Status bar with mode indicator, notifications, and dynamic filename/line count updates
- `src/ui/sidebar.ts` - File tree sidebar for directory browsing mode (vim j/k navigation, Enter to open, `/` search)

### File System

- `src/fs/tree.ts` - Recursive directory scanner for `.md` files, returns sorted `FileTree` with depth info

### Type Definitions

- `src/types.ts` - Shared types: `ThemeColors`, token types, `TextChunk`, `Mode`

## Key Implementation Details

### Highlighting System

- Uses OpenTUI's `_blockStates` (private API) to get rendered block positions
- Line mapping: searches for `tokenRaw` in content to find source line numbers
- Fixed 1-row line height for cursor highlights (prevents multi-line issues in lists)
- Viewport clipping prevents drift when blocks scroll above viewport

### Selection Model

- **Character-level selection** (mouse drag): handled natively by OpenTUI's renderer (`TextBufferRenderable` with `selectable: true`). Blue highlight, yanked with `y` via `renderer.getSelection()`
- **Line-level selection** (keyboard `V` mode): custom visual mode via `CursorManager`. Yellow highlight, yanked with `y` via `cursor.getSelectedContent()`
- Yank priority: character selection > visual line selection > `yy` document yank
- `Esc` clears both selection types; `V` clears character selection before entering line mode
- Renderer emits `"selection"` event on mouse-up to sync cursor position after character-level interactions

### Search System

- Pager-style `/` search with `n`/`N` navigation, works in both content pane and sidebar
- `stripMarkdownInline` strips concealed syntax (headings, links, bold, code spans) to compute accurate column offsets matching rendered output
- Underscore-based bold/italic intentionally not stripped — too ambiguous with code identifiers like `__tests__`
- Index-based match navigation: `nextMatch`/`prevMatch` cycle through individual matches including multiple hits on the same line
- Search highlights drawn via `renderAfter` as per-match `fillRect` at exact `(x + col, y, length, 1)` positions

### Scroll System

- Decoupled from render state - uses `scrollHeight / totalLines` for uniform line height
- Cursor follows vim-style navigation (j/k moves cursor, scroll follows)

### Directory Browsing Mode

- Activated when a directory path is passed instead of a file
- Two-pane layout: sidebar (30 cols, file tree) + content (markdown viewer)
- `FocusManager` tracks active pane; single `keypress` listener dispatches to sidebar or content handler
- File switch via sidebar `Enter`: creates new `MarkdownRenderable`, calls `reloadMarkdown`, resets cursor
- Pane switching: `Tab`, `Ctrl-h` (sidebar), `Ctrl-l` (content), `Esc` (back to content)
- `\` toggles sidebar visibility
- Zero-cost for single-file mode — all sidebar code behind `isDirectory` branch

## Key Dependencies

- `@opentui/core` - Terminal UI framework (BoxRenderable, MarkdownRenderable, ScrollBox)
- `shiki` - Syntax highlighting engine
- `marked` - Markdown parsing (tokens are processed by custom renderers)

## Testing

Tests use `bun:test` and are in `src/__tests__/`. Most tests focus on token parsing via `marked.lexer()` and utility functions rather than full rendering.

## Commits

- Use conventional commits
- Only use `-` delimited bullet points in commit bodies
