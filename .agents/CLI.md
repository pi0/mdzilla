# CLI (`src/cli/`)

Interactive terminal docs browser. No external CLI dependencies — raw ANSI + `process.stdin` in raw mode.

## Usage

```bash
pnpm mdzilla <dir>                # browse local docs directory
pnpm mdzilla <file.md>            # render single markdown file
pnpm mdzilla gh:owner/repo        # browse GitHub repo docs
pnpm mdzilla https://example.com  # browse remote docs via HTTP
pnpm mdzilla <dir> --export <out> # export docs to flat .md files
```

## File Structure

- `src/cli/main.ts` — app state, input handling, main loop (~510 LoC)
- `src/cli/ansi.ts` — ANSI escape helpers (bold, dim, cyan, highlight, wrapAnsi, etc.)
- `src/cli/nav.ts` — nav panel renderer (tree connectors, scroll, search highlights)
- `src/cli/content.ts` — content renderer (markdown → ANSI with syntax highlighting)
- `src/cli/render.ts` — compositor (combines sidebar + content, renders footer)
- `src/docs/manager.ts` — `DocsManager` class (tree loading, flat entries, file map, content cache, fuzzy search)
- `src/docs/source.ts` — `DocsSourceFS` (local), `DocsSourceGit` (GitHub via giget), `DocsSourceHTTP` (remote HTTP with llms.txt)
- `src/docs/exporter.ts` — `DocsExporterFS` (export docs to flat .md files)

## Architecture

Split-pane layout: nav tree on the left, content on the right. Content auto-loads as cursor moves.

### Data Flow

```
DocsManager (src/docs/manager.ts)
  ├── .load()        → source.load() + flattenTree()
  ├── .flat          → FlatEntry[] for rendering
  ├── .getContent()  → cached file reads via source.readContent()
  ├── .filter()      → fuzzy search (title + path)
  ├── .matchIndices()→ substring match indices
  └── .invalidate()  → clear content cache for a path
        ↓
  main.ts (state machine + event loop)
        ↓ renderSplit()
  render.ts (compositor: sidebar + separator + content + footer)
        ↓              ↓
  nav.ts           content.ts
  (tree panel)     (md → ANSI + code highlighting)
        ↓              ↓
     ansi.ts (styling, wrapping, highlighting)
        ↓
  process.stdout.write()
```

### Input Modes

Four input modes controlled by boolean flags:

1. **browse** (default) — nav tree focused, content auto-loads on cursor move
2. **content** — content panel focused, ↑↓ scroll line-by-line
3. **nav search** — filtered nav tree with live fuzzy query input
4. **content search** — search within current page content, `n`/`N` to jump between matches

### Key Bindings

**Browse:** `↑↓`/`jk` navigate, `enter`/`tab`/`→` focus content, `space`/`PgDn` page down, `b`/`PgUp` page up, `g`/`G` first/last, `/` search, `t` toggle sidebar, `q` quit

**Content:** `↑↓`/`jk` scroll line-by-line, `space`/`PgDn` page down, `b`/`PgUp` page up, `g`/`G` top/bottom, `/` content search, `n`/`N` next/prev match, `t` toggle sidebar, `⌫`/`esc`/`tab` back to nav, `q` quit

**Nav search:** type to fuzzy-filter (title + path), `↑↓` navigate results, `enter` confirm, `esc` cancel

**Content search:** type to search, `↑↓` navigate matches (auto-scrolls to center), `enter` confirm, `esc` cancel (keeps matches for `n`/`N`)

**Mouse:** click nav entry to select, click content area to focus, scroll wheel over nav/content to scroll (3-line steps)

## Module Details

### ANSI Helpers (`ansi.ts`)

All styling uses raw escape sequences — no chalk/colorette dependency:

- `bold`, `dim`, `cyan`, `yellow`, `bgGray` — style wrappers
- `stripAnsi` — regex strip for visible-length calculation
- `ANSI_RE` — matches both CSI (`\x1B[...letter`) and OSC 8 hyperlinks (`\x1B]8;;url\x1B\\` or `\x1B]...\x07`)
- `padTo(s, width)` — pads/truncates to exact visual width (ANSI-aware)
- `truncateTo(s, width)` — truncates to max visual width
- `wrapAnsi(s, width)` — ANSI-aware word wrapping with SGR + OSC 8 state propagation
- `highlightAnsi(s, query)` — highlight matches in ANSI-styled string (reverse video)
- `highlight(text, query)` — simple text highlight (bold yellow)

### Sidebar (`nav.ts`)

- `calcNavWidth(flat)` — optimal sidebar width (6–56 chars, max 20% terminal)
- `renderNavPanel(flat, cursor, maxRows, width, search?, searchMatches?)` → `string[]`
- Tree connectors: `│`, `├─`, `╰─` with proper continuation lines
- Active entry: `bgGray` highlight; search matches: bold yellow
- Scroll indicators (↑↓) with position counter

### Content (`content.ts`)

- `renderContent(content, entry, navWidth)` → `Promise<string[]>`
- Strips YAML frontmatter, extracts code blocks
- Pre-highlights code blocks via `@speed-highlight/core/terminal` in parallel
- Renders markdown via `md4x` `renderToAnsi()`
- Post-replaces dim code blocks with highlighted versions
- Wraps lines to content panel width

### Compositor (`render.ts`)

- `renderSplit(...)` → full screen string (nav + separator + content + footer)
- Footer shows context-sensitive help for current mode
- Separator `│` highlighted cyan when content focused
- Supports toggling sidebar visibility
- Re-exports `calcNavWidth` and `renderContent`

### DocsManager (`src/docs/manager.ts`)

- `FlatEntry { entry: NavEntry, depth: number, filePath?: string }`
- Delegates to `DocsSource.load()` then `flattenTree()`
- Content cache: lazy reads via `source.readContent()` with `Map<filePath, content>`
- Search delegates to `fuzzyFilter()` (inlined in `manager.ts`)

### Sources (`src/docs/sources/`)

- `DocsSourceFS` — load from local filesystem directory
- `DocsSourceGit` — download from GitHub via giget, supports `auth` and `subdir` options
  - Downloads to `node_modules/.mdzilla/gh/<id>/`
- `DocsSourceHTTP` — fetch pages over HTTP; tries `/llms.txt` first, falls back to homepage link extraction
  - Sends `Accept: text/markdown` header

### Exporter (`src/docs/exporter.ts`)

- `DocsExporterFS` — export flat entries as `<outdir>/<path>.md`
- `ExportOptions.filter` — custom callback `(entry: FlatEntry) => boolean` to filter entries (default: skip stubs)

### Link Navigation

Content mode supports interactive links:

- `Tab` / `Shift+Tab` — cycle through links in content
- `Enter` on a link — activate (external: open in browser, relative: navigate to entry)
- Links are extracted from rendered content and tracked as `contentLinks[]`

## Key Design Decisions

- **No dependencies**: raw stdin + ANSI escapes keep it zero-dep for terminal control
- **Split pane, not modal**: nav + content always visible; no separate "page mode"
- **Auto-loading content**: async file read on cursor change; skips if same file already loaded
- **DocsManager abstraction**: tree scanning, file mapping, content caching, and fuzzy search in one class
- **Two-pass code highlighting**: extract & highlight code blocks separately, then post-replace in rendered output
- **Flat list for navigation**: tree is flattened with depth tracking for indent, simplifies cursor/scroll logic
- **Search confirms then returns to full tree**: enter in search jumps cursor to the matched entry in the unfiltered list
- **State-driven rendering**: all UI derived from state; `draw()` re-renders entire screen

## ANSI Gotchas

- **OSC 8 hyperlinks**: md4x `renderToAnsi` emits `\x1B]8;;url\x1B\\` (ST terminator, not BEL `\x07`). All ANSI stripping/tokenizing must handle both terminators.
- **Style leaking in split layout**: each row must reset styles (`\x1B[0m`) between nav panel, separator, and content panel. Content lines must be self-contained (reset at end).
- **Wrap with style propagation**: `wrapAnsi` must close and reopen both SGR styles and OSC 8 hyperlinks at line break points, otherwise underlines/colors leak to the nav panel on the next row.
