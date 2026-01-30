# mdv

A terminal markdown viewer with vim keybindings, built with [OpenTUI](https://opentui.com) and [shiki](https://shiki.style) for syntax highlighting.

## Installation

### From source

```bash
# Clone the repository
git clone https://github.com/yourusername/mdv.git
cd mdv

# Install dependencies
bun install

# Link globally (optional)
bun link
```

### Global install

```bash
# After linking, use from anywhere
mdv README.md
```

## Usage

```bash
# View a markdown file
bun run src/index.ts README.md

# Pipe content from stdin
cat README.md | bun run src/index.ts -

# With a specific theme
bun run src/index.ts -t dracula README.md

# List available themes
bun run src/index.ts --list-themes
```

## Keybindings

| Key | Action |
|-----|--------|
| `j` / `↓` | Scroll down one line |
| `k` / `↑` | Scroll up one line |
| `gg` | Go to top |
| `G` | Go to bottom |
| `Ctrl-d` | Scroll down half page |
| `Ctrl-u` | Scroll up half page |
| `Ctrl-f` / `Space` / `PageDown` | Scroll down full page |
| `Ctrl-b` / `PageUp` | Scroll up full page |
| `Home` | Go to top |
| `End` | Go to bottom |
| `q` / `Ctrl-c` | Quit |

## Features

- Full markdown rendering with proper styling
- Syntax highlighting for code blocks (50+ languages)
- Theme support via shiki (github-dark default, 30+ themes available)
- Vim-style navigation
- Supports:
  - Headings (ATX and Setext style)
  - Bold, italic, strikethrough
  - Links (with URL display)
  - Images (shows alt text)
  - Code blocks with syntax highlighting
  - Inline code
  - Ordered and unordered lists (nested)
  - Blockquotes (nested)
  - Tables
  - Horizontal rules
  - HTML blocks and inline HTML
  - Subscript/superscript (via Unicode)
  - Reference-style links
  - Escape sequences

## Options

```
-t, --theme <name>  Set syntax highlighting theme (default: github-dark)
--list-themes       List available themes
-h, --help          Show help
```

## Development

```bash
# Run with hot reload
bun dev

# Run directly
bun run src/index.ts <file.md>
```

## Built With

- [OpenTUI](https://opentui.com) - Terminal UI framework
- [shiki](https://shiki.style) - Syntax highlighting
- [marked](https://marked.js.org) - Markdown parsing
- [Bun](https://bun.sh) - JavaScript runtime

## License

MIT
