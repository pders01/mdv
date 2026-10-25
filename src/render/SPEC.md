---
id: terminal-rendering
type: module-design
title: Shared terminal rendering and stdout backend
status: draft
tags:
  - rendering
  - stdout
  - terminal
---

# Shared terminal rendering and stdout backend

## Boundary

Interactive terminal display and one-shot stdout output share document parsing, extension transforms, token conversion, theme resolution, syntax highlighting, and token-to-Spec factories. Backend selection happens after Spec creation: the TUI mounts renderables; stdout lays out terminal rows and serializes text or ANSI. The browser retains its separate HTML pipeline.

Document-to-Spec orchestration owns top-level source spans and plugin execution, including passing source text into transforms. It must not construct renderables. The legacy marked-based RenderBlock testing helper is not a production backend: using it for stdout would diverge from the unified parser and current rendering rules.

Specs retain existing RGBA-valued chunks for compatibility. Importing color helpers is permitted; stdout must never initialize a CliRenderer, raw input, alternate screen, mouse capture, or UI lifecycle.

## Stdout contract

`--stdout` is explicit, never inferred from redirection. It accepts one regular file or `-` stdin. Directories, watch mode, and server/browser options fail rather than silently changing meaning. Empty input emits nothing. Errors use stderr and a nonzero exit status; an early pipe close is normal shell behavior. Browser `--print` is unaffected.

Width is a positive integer, chosen from `--width`, terminal columns, or 80 when redirected. `--color auto|always|never` defaults to auto. Auto honors nonempty NO_COLOR before FORCE_COLOR, treats FORCE_COLOR=0 as disabled, and otherwise follows stdout's TTY status. Explicit color modes override the environment. Theme selection uses the TUI's single resolved palette, including system appearance for auto.

## Layout and safety

The ANSI backend owns wrapping, box composition, padding, margins, and local code backgrounds. Word wrapping crosses style boundaries, and leading indentation alone is not a word-break opportunity. Graphemes are segmented across the combined styled text before measurement; a cluster spanning chunks uses the style at its starting character so neither wrapping nor ANSI codes split it. Character wrapping preserves graphemes, and no-wrap text clips instead of fragmenting diagrams. Widths are terminal cell widths, not string lengths; tabs expand to four-column stops. At extremely narrow widths decorative padding shrinks, row children stack if they cannot each receive a cell, and a grapheme wider than the available row becomes a replacement character. Short row prefixes retain their natural width while wider siblings shrink first. Unspecified box direction is treated as vertical document flow in stdout; explicit rows remain horizontal when space permits.

Outer blank rows and trailing spaces in plain output are omitted. Nonempty output ends with a newline. ANSI styles reset at each line boundary, code backgrounds are confined to code rows, and no page-wide terminal background is set. Shorthand and alpha-valued theme colors are supported; translucent code backgrounds are composited over the theme's page background because ANSI has no alpha channel. Document-controlled escape sequences and nonprinting terminal controls are removed rather than executed. The backend emits styling sequences only, never cursor or screen commands.

Mermaid uses the shared ASCII pre-pass with the available code-content width; disabled, missing, failed, or oversized diagram rendering falls back to source. No new hyperlink convention or pager lifecycle is introduced.
