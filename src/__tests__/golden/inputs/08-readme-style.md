# mdv

> A terminal markdown viewer with vim keybindings.

## Features

- **Syntax highlighting** via [Shiki](https://shiki.style/)
- **Vim-style keybindings**: `j`/`k`, `gg`/`G`, `Ctrl-d`/`Ctrl-u`, `yy`, `V`, `/`, `n`/`N`
- Mouse support (click, drag, scroll)
- File tree sidebar for directory mode
- Watch mode (`--watch`) for live reload
- Web UI via `mdv serve`

## Install

```bash
# from source
git clone https://github.com/example/mdv
cd mdv
bun run install-global
```

Or download a prebuilt binary from the [releases page](https://github.com/example/mdv/releases).

## Usage

```bash
mdv README.md           # view a single file
mdv ./docs              # browse a directory
mdv --watch README.md   # live-reload on save
mdv serve ./docs        # serve as a web UI
```

### Keybindings

| Key       | Action               |
|-----------|----------------------|
| `j` / `k` | Cursor down / up     |
| `gg`      | Top of document      |
| `G`       | Bottom of document   |
| `Ctrl-d`  | Half-page down       |
| `Ctrl-u`  | Half-page up         |
| `yy`      | Yank current line    |
| `V`       | Visual line mode     |
| `/`       | Search forward       |
| `n` / `N` | Next / prev match    |
| `q`       | Quit                 |

### Themes

By default mdv detects your terminal appearance and picks a matching theme:

1. `MDV_APPEARANCE` env var (`light` / `dark`)
2. `COLORFGBG` env var
3. macOS `defaults read -g AppleInterfaceStyle`
4. Linux `gsettings get` for GNOME
5. Falls back to dark

Override with `--theme`:

```bash
mdv --theme github-light README.md
mdv --theme dracula      README.md
```

## Configuration

See `~/.config/mdv/config.toml` (TODO):

```toml
theme = "auto"
mouse = true

[keybindings]
quit = ["q", "Esc"]
```

## Contributing

Pull requests welcome. Please run:

```bash
bun test
bun run lint
```

before opening a PR.

## License

MIT &copy; 2026
