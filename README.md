# mdv

A terminal markdown viewer with vim keybindings, built with [OpenTUI](https://opentui.com) and [shiki](https://shiki.style) for syntax highlighting.

## Requirements

- [Bun](https://bun.sh) v1.0 or later

## Installation

### From GitHub Releases (recommended)

Download the latest binary for your platform from [Releases](https://github.com/pders01/mdv/releases):

```bash
# macOS (Apple Silicon)
curl -LO https://github.com/pders01/mdv/releases/latest/download/mdv-darwin-arm64.tar.gz
tar xzf mdv-darwin-arm64.tar.gz && sudo mv mdv-darwin-arm64 /usr/local/bin/mdv

# macOS (Intel)
curl -LO https://github.com/pders01/mdv/releases/latest/download/mdv-darwin-x64.tar.gz
tar xzf mdv-darwin-x64.tar.gz && sudo mv mdv-darwin-x64 /usr/local/bin/mdv

# Linux (x64)
curl -LO https://github.com/pders01/mdv/releases/latest/download/mdv-linux-x64.tar.gz
tar xzf mdv-linux-x64.tar.gz && sudo mv mdv-linux-x64 /usr/local/bin/mdv
```

### From source

```bash
git clone https://github.com/pders01/mdv.git
cd mdv
bun install

# Build for current platform
bun run build
sudo mv mdv /usr/local/bin/

# Or use the install script
bun run install-global
```

### Run without installing

```bash
bun run src/index.ts README.md
```

## Usage

```bash
# View a markdown file
mdv README.md

# Read from stdin (pipe)
cat README.md | mdv
curl -s https://example.com/doc.md | mdv

# With a specific theme
mdv -t dracula README.md
cat README.md | mdv -t dracula

# List available themes
mdv --list-themes
```

## Keybindings

### Navigation

| Key                             | Action                |
| ------------------------------- | --------------------- |
| `j` / `↓`                       | Scroll down one line  |
| `k` / `↑`                       | Scroll up one line    |
| `gg`                            | Go to top             |
| `G`                             | Go to bottom          |
| `Ctrl-d`                        | Scroll down half page |
| `Ctrl-u`                        | Scroll up half page   |
| `Ctrl-f` / `Space` / `PageDown` | Scroll down full page |
| `Ctrl-b` / `PageUp`             | Scroll up full page   |
| `Home`                          | Go to top             |
| `End`                           | Go to bottom          |

### Yank (Copy)

| Key                  | Action                            |
| -------------------- | --------------------------------- |
| `yy`                 | Copy entire document to clipboard |
| `V`                  | Enter visual line mode            |
| `y` (in visual mode) | Copy selection to clipboard       |
| `Esc`                | Exit visual mode                  |

### General

| Key            | Action |
| -------------- | ------ |
| `q` / `Ctrl-c` | Quit   |

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
