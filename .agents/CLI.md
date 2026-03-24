# CLI (`src/cli/`)

Documentation browser CLI. Renders pages, searches content, or opens a web server for interactive browsing.

## Usage

```bash
mdzilla <source>                    # open docs in browser (web server)
mdzilla <source> <path>             # render a specific page
mdzilla <source> <query>            # search docs
mdzilla <file.md>                   # render single markdown file
mdzilla <source> --export <outdir>  # export docs to flat .md files
mdzilla <source> --plain            # force plain text output
```

The second positional argument is smart-resolved: if it matches a nav path, the page is rendered; otherwise it's treated as a search query.

## File Structure

- `src/cli/main.ts` — entry point: arg parsing, smart resolve routing
- `src/cli/render.ts` — render modes (singleFile, renderPage, searchMode, tocMode, serverMode)
- `src/cli/content.ts` — content renderer (markdown → ANSI with syntax highlighting)
- `src/cli/_ansi.ts` — ANSI escape helpers (bold, dim, cyan, wrapAnsi, highlight)
- `src/cli/_usage.ts` — help text
- `src/cli/_utils.ts` — browser opener utility

## Architecture

### Modes

1. **Server** (default, no query) — starts srvx web server, opens browser
2. **Render** (query matches nav path) — prints page content (ANSI or plain markdown)
3. **Search** (query doesn't match nav) — searches titles + content, prints results
4. **TOC** (plain, no query) — prints table of contents + first page
5. **Export** (`--export`) — writes flat `.md` files
6. **Single file** (input ends with `.md`) — renders one markdown file

### Output Formats

- **Colored** (TTY, not agent) — ANSI-styled output via md4x `renderToAnsi` + code highlighting
- **Plain** (non-TTY, `isAgent`, or `--plain`) — raw markdown text + agent trailers

### Data Flow

```
Collection (src/collection.ts)
  ├── .load()        → source.load() + flattenTree()
  ├── .resolvePage() → exact match, prefix stripping, or direct fetch
  ├── .search()      → async iterator: title + content matching
  └── .filter()      → fuzzy search (title + path)
        ↓
  main.ts (smart resolve: path → render, else → search)
        ↓
  render.ts (mode dispatch)
        ↓
  content.ts (md → ANSI + code highlighting)
        ↓
  _ansi.ts (styling, wrapping)
        ↓
  process.stdout.write()
```

### Smart Resolve

The second positional argument goes through:

1. `docs.resolvePage(query)` — exact path match (with prefix stripping fallback)
2. If no match → `searchMode(docs, query)` — search titles and content

### Agent Integration

When `isAgent` is detected (or `--plain`):
- Output is raw markdown (via `renderToText`)
- Trailers appended with other available pages and usage hints
- Search results include structured badges (title/content match counts)

## Module Details

### ANSI Helpers (`_ansi.ts`)

Raw escape sequences — no chalk/colorette dependency:

- `bold`, `dim`, `cyan`, `yellow` — style wrappers (disabled when `NO_COLOR`, non-TTY, or agent)
- `stripAnsi` — regex strip for visible-length calculation
- `wrapAnsi(s, width)` — ANSI-aware wrapping with SGR + OSC 8 state propagation
- `highlight(text, query)` — simple text highlight (bold yellow)

### Content (`content.ts`)

- `renderContent(content, entry)` → `Promise<string[]>`
- Extracts code blocks, pre-highlights via `@speed-highlight/core/terminal` in parallel
- Renders markdown via `md4x` `renderToAnsi()`
- Post-replaces dim code blocks with highlighted versions
- Wraps lines to terminal width

## ANSI Gotchas

- **OSC 8 hyperlinks**: md4x emits `\x1B]8;;url\x1B\\` (ST terminator, not BEL). ANSI stripping must handle both.
- **Wrap with style propagation**: `wrapAnsi` must close and reopen both SGR styles and OSC 8 hyperlinks at break points.
