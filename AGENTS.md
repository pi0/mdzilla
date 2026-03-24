# mdzilla

Documentation tooling built on [md4x](https://github.com/unjs/md4x).

## Project Structure

```
src/
  index.ts          — library entry (exports Collection, sources, exporters)
  utils.ts         — shared text utilities (extractSnippets)
  collection.ts     — Collection class (tree, flat entries, content cache, fuzzy search)
                      includes flattenTree(), fuzzyMatch(), fuzzyFilter() as internal helpers
  nav.ts            — Nav scanner using md4x parseMeta
  source.ts         — re-exports all sources for backwards compat
  exporter.ts       — writeCollection function
  sources/
    _base.ts        — Source abstract base class
    fs.ts           — FSSource (local filesystem), includes buildFileMap()
    git.ts          — GitSource (GitHub via giget)
    npm.ts          — NpmSource (npm packages via giget)
    http.ts         — HTTPSource (remote HTTP/HTML→markdown, llms.txt support)
  cli/
    main.ts         — entry point: arg parsing, smart resolve routing
    render.ts       — render modes (singleFile, renderPage, searchMode, tocMode, serverMode)
    content.ts      — content rendering (markdown → ANSI, code syntax highlighting)
    _ansi.ts        — ANSI escape helpers (bold, dim, wrapAnsi, highlight)
    _usage.ts       — help text
    _utils.ts       — browser opener utility
test/
  nav.test.ts       — snapshot tests for Nav scanner
  fixture/          — simple test fixture (index, getting-started, api, drafts, partials)
  docs/             — fixture: H3 docs site (complex structure)
    .config/docs.yaml   — site config (name, theme, redirects, landing)
    .navigation.yml     — per-directory metadata (title, icon)
    {N}.{slug}/         — numbered directories for ordering
    {N}.{slug}.md       — numbered markdown files
```

## Conventions

### Web / Library Boundary

Code in `web/` must import from `"mdzilla"` (the package), never via relative paths like `"../../../src/..."`. Relative imports bypass the bundler's deduplication and double-bundle shared logic.

### Docs Directory Structure

See [.agents/NAV.md](.agents/NAV.md) for full Nav scanner expected behavior.

- **Numbered prefixes** for ordering: `1.guide/`, `2.utils/`, `0.index.md` (can be overridden via frontmatter `order` or `navigation.order`)
- **`.navigation.yml`** in directories for title/icon metadata
- **Frontmatter** in `.md` files for page-level metadata (icon, description)
- **`index.md` or `0.index.md`** as directory index pages (slug becomes `""`)
- Hidden/config files (`.config`, `.partials`, `package.json`) are skipped
- **`_` prefixed** files/dirs are partials, excluded from navigation
- **`.draft.md`** suffix marks drafts (excluded by default, opt-in via `drafts` option)
- **`navigation: false`** in frontmatter or `.navigation.yml` excludes from tree
- **`navigation: { title, icon, order }`** in frontmatter overrides nav-specific fields

### CLI

See [.agents/CLI.md](.agents/CLI.md) for CLI architecture and render modes.

### md4x Usage

- `parseMeta(content)` returns `ComarkMeta`: `{ title?, headings[], ...frontmatter }`
- Frontmatter fields (icon, description) are spread into the meta object
- Title is inferred from first `# heading` if not in frontmatter

## Key Types

```ts
interface NavEntry {
  slug: string; // URL-friendly path segment (no numeric prefix)
  path: string; // full resolved URL path from root (e.g., "/guide/installation")
  title: string; // from frontmatter → first heading → humanized slug
  order: number; // numeric prefix (Infinity if unnumbered)
  icon?: string; // from frontmatter, navigation override, or .navigation.yml
  description?: string;
  page?: false; // false when directory has no index page
  children?: NavEntry[];
  [key: string]: unknown; // arbitrary extra frontmatter fields
}

interface ScanNavOptions {
  drafts?: boolean; // include draft files (default: false)
}
```

## Library Exports (`src/index.ts`)

### Core

- `Collection` — main class: `load()`, `reload()`, `getContent()`, `invalidate()`, `filter()`, `search()`, `suggest()`, `resolvePage()`
- `FlatEntry` — `{ entry: NavEntry, depth: number, filePath?: string }`
- `NavEntry` — navigation tree node type

### Sources

- `Source` — abstract base class (`load()`, `readContent()`)
- `FSSource` — load from local filesystem directory
- `GitSource` — download from GitHub via giget, then read locally
  - `GitSourceOptions` — `{ auth?: string, subdir?: string }`
- `NpmSource` — download npm package via giget, then read locally
  - `NpmSourceOptions` — `{ subdir?: string }`
- `HTTPSource` — fetch pages over HTTP with `Accept: text/markdown`
  - `HTTPSourceOptions` — `{ headers?: Record<string, string> }`

### Exporters

- `exportSource` — high-level one-call export: resolves source, loads, and exports
- `writeCollection` — low-level export of a loaded `Collection` to `<outdir>/<path>.md`
  - `ExportOptions` — `{ filter?, plainText?, tocFile?, title? }`

### Utilities

- `resolveSource(input)` — resolve `"./dir"` / `"gh:..."` / `"npm:..."` / `"https://..."` to a `Source`

### Utilities

- `extractSnippets(content, terms, opts?)` — extract text snippets around matching terms

### Internal Utilities (not exported)

- `fuzzyMatch(query, target)` — score-based fuzzy matching (-1 = no match)
- `fuzzyFilter(items, query, getText)` — filter + sort by fuzzy score
- `flattenTree(tree, depth, fileMap)` — flatten NavEntry tree → FlatEntry[]
- `buildFileMap(basePath, dir)` — walk directory, map nav paths → filesystem paths

## CLI

The CLI is available as both `mdzilla` and the shorter `mdz` alias (see `bin` in `package.json`).

### Usage Maintenance

When CLI options, modes, or usage patterns change, keep these in sync:

- **`src/cli/main.ts`** — `parseArgs` options and the help text printed on `--help`
- **`README.md`** — Quick Start, Features tables, and Options sections
- **`skills/mdzilla/SKILL.md`** — Agent skill documentation (options, examples)
- **This file** — CLI Modes section below

### Modes

```bash
mdzilla <source>                    # open docs in browser (web server)
mdzilla <source> <path>             # render a specific page
mdzilla <source> <query>            # search docs
mdzilla <file.md>                   # render single markdown file
mdzilla <source> --export <outdir>  # export docs to flat .md files
```

The second positional argument is smart-resolved: if it matches a nav path, the page is rendered; otherwise it's treated as a search query.

## Testing

- Uses vitest with snapshot tests (`toMatchSnapshot` / `toMatchInlineSnapshot`)
- Fixture: `test/docs/` (H3 docs site structure)
- Run: `pnpm vitest run test/nav.test.ts`
