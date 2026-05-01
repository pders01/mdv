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

# Browse a directory of markdown files
mdv ./docs
mdv .

# Read from stdin (pipe)
cat README.md | mdv
curl -s https://example.com/doc.md | mdv

# Watch a file for live reload
mdv -w README.md

# Watch a directory (reloads active file, marks changed files in sidebar)
mdv -w ./docs

# Serve a directory over HTTP with the same vim keymap on the web
mdv serve ./docs

# Serve with live reload — page refreshes on every save
mdv serve ./docs --watch

# With a specific theme
mdv -t dracula README.md

# Exclude directories when browsing
mdv -e drafts -e tmp ./docs

# List available themes
mdv --list-themes
```

## Directory Browsing

Pass a directory instead of a file to open a sidebar file browser:

```bash
mdv ./docs
```

This recursively scans for `.md` files and displays them in a navigable sidebar. The following directories are excluded by default: `node_modules`, `.git`, `vendor`, `dist`, `build`, `.next`, `.nuxt`, `__pycache__`, `.venv`, `target`, `.hg`, `.svn`.

Use `-e`/`--exclude` to add custom exclusions (repeatable).

## Serve Mode

Use `mdv serve` to serve a directory of markdown files over HTTP. The web UI mirrors the TUI's two-pane layout and vim keymap, so muscle memory carries between modes:

```bash
mdv serve ./docs
```

Default URL is `http://localhost:4280`. The same Shiki theme drives both modes — `mdv serve --theme dracula` recolors the entire web UI from a single CSS-variable block.

When `--theme=auto` (the default), the web UI ships **both** `github-light` and `github-dark` and the browser picks per `prefers-color-scheme`. This is independent of the host OS — a server reached over `--host 0.0.0.0` matches each viewer's appearance, not the machine running `mdv serve`. Pass `--theme <name>` to lock a single theme for everyone.

### Live reload

Pass `--watch` and the page refreshes whenever a markdown file in the served tree changes (creates and renames included):

```bash
mdv serve ./docs --watch
```

Scroll position, sidebar cursor, and pane focus are preserved across reloads via `sessionStorage`, so saving a file lands you back at the same place — no manual re-scrolling.

### Mermaid diagrams

Fenced ```` ```mermaid ```` blocks render client-side from a locally-vendored mermaid bundle. The bundle is lazy-loaded only when a page actually contains a mermaid fence, so docs without diagrams pay zero bytes. Pass `--no-mermaid` to skip it; fences then render as plain code blocks.

### Serve options

```
    --serve           Serve over HTTP instead of TUI (or use the `serve` subcommand)
-p, --port <port>     Port to bind (default: 4280)
    --host <host>     Host to bind (default: localhost)
-o, --open            Open the URL in the default browser
-q, --quiet           Suppress startup banner and access log
-w, --watch           Live reload on file changes
    --no-mermaid      Skip the mermaid adapter
```

## Themes

Default `--theme=auto` picks `github-light` or `github-dark` based on system appearance. Detection ladder:

1. `MDV_APPEARANCE=light|dark` env var (explicit override)
2. `COLORFGBG` env var (set by some terminals)
3. macOS: `defaults read -g AppleInterfaceStyle`
4. Linux: `gsettings get org.gnome.desktop.interface color-scheme`
5. Falls back to `dark`

In TUI mode the resolved theme is used directly. In `mdv serve` mode `auto` ships both light and dark CSS and the browser picks per `prefers-color-scheme`.

```bash
# Force light/dark for one run regardless of system
MDV_APPEARANCE=light mdv ./docs

# Pick an explicit theme
mdv -t dracula README.md

# Browse all available themes
mdv --list-themes
```

Shiki languages load on demand based on what fence languages a file actually uses, so cold-open is fast even when many themes/languages are bundled.

## Keybindings

The same vim-style keymap drives the TUI and the web UI; tables below apply to both unless noted.

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

### Directory Mode

| Key      | Action                 |
| -------- | ---------------------- |
| `Tab`    | Switch panes           |
| `Ctrl-h` | Focus sidebar          |
| `Ctrl-l` | Focus reader           |
| `\`      | Toggle sidebar         |
| `Enter`  | Open file from sidebar |
| `Esc`    | Back to reader pane    |

All navigation keys (j/k, Ctrl-d/u, etc.) work in both panes.

### Yank (Copy)

| Key                  | Action                            |
| -------------------- | --------------------------------- |
| `yy`                 | Copy entire document to clipboard |
| `V`                  | Enter visual line mode            |
| `y` (in visual mode) | Copy selection to clipboard       |
| `Esc`                | Exit visual mode                  |

### Search

| Key   | Action                      |
| ----- | --------------------------- |
| `/`   | Start search                |
| `n`   | Next match                  |
| `N`   | Previous match              |
| `Esc` | Clear search / cancel input |

Search works in both the reader pane and the sidebar file list. Matches are highlighted inline with exact position awareness (accounts for markdown conceal).

### General

| Key            | Action |
| -------------- | ------ |
| `q` / `Ctrl-c` | Quit   |

## Features

- 98% CommonMark conformance, GFM tables / task lists / strikethrough / autolinks
- Built on the `unified` / `remark` / `rehype` ecosystem — same parser the web uses
- Syntax highlighting for code blocks (50+ languages) via shiki
- Theme support via shiki (auto-detects light/dark from system, 60+ explicit themes available)
- Two viewing modes from one binary: TUI (default) and HTTP (`mdv serve`)
- Live reload with `--watch` in both modes; the web mode preserves scroll and cursor across reloads
- Directory browsing with sidebar file tree
- Pager-style search (`/`, `n`/`N`) with inline match highlighting (works against the active pane in both modes)
- Vim-style navigation shared between the TUI and the web UI

### Markdown formats supported

| Format | TUI render | Web render |
| --- | --- | --- |
| CommonMark | full | full |
| GFM (tables, task lists, strikethrough, autolinks) | full | full |
| Frontmatter (YAML / TOML) | hidden | hidden |
| GitHub-style alerts (`> [!NOTE]` etc) | colored bar + icon + label | styled `<div class=markdown-alert>` |
| Footnotes (`[^N]` + definitions) | `[N]` refs + numbered defs at bottom | `<section>` with backrefs |
| Math (`$inline$` and `$$block$$`) | LaTeX source preserved | KaTeX rendered |
| Wiki links (`[[Page]]`, `[[Page\|Label]]`) | link to `#/page/slug` | `<a class="internal new">` |
| Definition lists (`term\n: def`) | indented stack | `<dl><dt><dd>` |
| Container directives (`:::name`) | alert (if name matches) or labelled blockquote | hast tree via `remark-directive` |
| Highlight (`==text==`) | yellow bold | `<mark>` |
| Subscript / superscript (`H~2~O`, `x^2^`) | unicode `₂` `²` | `<sub>` / `<sup>` |
| Mermaid diagrams | pre-rendered ASCII | client-side SVG (locally bundled, no CDN) |

## Options

```
-t, --theme <name>    Set syntax highlighting theme (default: auto, follows system light/dark)
-T, --list-themes     List available themes
-w, --watch           Live reload on file changes
-e, --exclude <dir>   Exclude directory from scan (repeatable)
    --no-mouse        Disable mouse input (TUI only)
    --no-mermaid      Disable mermaid diagram rendering
    --serve           Serve over HTTP instead of TUI
-p, --port <port>     Port for serve mode (default: 4280)
    --host <host>     Host for serve mode (default: localhost)
-o, --open            Open the served URL in the default browser
-q, --quiet           Suppress startup banner and access log (serve mode)
    --debug           Enable debug logging
-v, --version         Show version
-h, --help            Show help
```

Run `mdv --help` for the same list grouped by section.

## Development

```bash
# Run with hot reload
bun dev

# Run directly
bun run src/index.ts <file.md>

# Run tests / lint
bun test
bun run lint

# Performance benches (TestRenderer-backed, no TTY needed)
bun run bench:scroll        # j-key scroll loop, prints per-frame stats
bun run bench:keys           # per-action timing for j/k, gg/G, search, etc.
bun run bench:reload         # construct vs mutate cost on file reload
bun run bench:gen-fixture    # regenerate src/__tests__/fixtures/big.md
```

Press `Ctrl-G` inside the running TUI to toggle a live fps overlay. Run with `--debug` to print a phase breakdown (shiki create / theme extract / mermaid prerender / markdown construct / etc.) on startup.

## Built With

- [OpenTUI](https://opentui.com) - Terminal UI framework
- [shiki](https://shiki.style) - Syntax highlighting
- [marked](https://marked.js.org) - Markdown parsing
- [Bun](https://bun.sh) - JavaScript runtime

## License

MIT
