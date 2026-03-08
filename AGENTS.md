# mdzilla

Documentation tooling built on [md4x](https://github.com/unjs/md4x).

## Project Structure

```
src/
  index.ts          — library entry (exports DocsManager, sources, exporters)
  cli/
    main.ts         — CLI app: state management, input handling, main loop (~510 LoC)
    ansi.ts         — ANSI escape helpers (bold, dim, cyan, wrap, highlight, etc.)
    nav.ts          — sidebar/nav panel rendering (tree connectors, scroll, highlights)
    content.ts      — content rendering (markdown → ANSI, code syntax highlighting)
    render.ts       — compositor (renderSplit combines sidebar + content + footer)
  docs/
    manager.ts      — DocsManager class (tree, flat entries, content cache, fuzzy search)
                      includes flattenTree(), fuzzyMatch(), fuzzyFilter() as internal helpers
    nav.ts          — Nav scanner using md4x parseMeta
    source.ts       — re-exports all sources for backwards compat
    sources/
      _base.ts      — DocsSource abstract base class
      fs.ts         — DocsSourceFS (local filesystem), includes buildFileMap()
      git.ts        — DocsSourceGit (GitHub via giget)
      npm.ts        — DocsSourceNpm (npm packages via giget)
      http.ts       — DocsSourceHTTP (remote HTTP/HTML→markdown, llms.txt support)
    exporter.ts     — DocsExporter (abstract), DocsExporterFS
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

See [.agents/CLI.md](.agents/CLI.md) for interactive terminal browser design.

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

- `DocsManager` — main class: `load()`, `reload()`, `getContent()`, `invalidate()`, `filter()`, `matchIndices()`
- `FlatEntry` — `{ entry: NavEntry, depth: number, filePath?: string }`
- `NavEntry` — navigation tree node type

### Sources

- `DocsSource` — abstract base class (`load()`, `readContent()`)
- `DocsSourceFS` — load from local filesystem directory
- `DocsSourceGit` — download from GitHub via giget, then read locally
  - `DocsSourceGitOptions` — `{ auth?: string, subdir?: string }`
- `DocsSourceNpm` — download npm package via giget, then read locally
  - `DocsSourceNpmOptions` — `{ subdir?: string }`
- `DocsSourceHTTP` — fetch pages over HTTP with `Accept: text/markdown`; falls back to mdream HTML→markdown conversion
  - `DocsSourceHTTPOptions` — `{ headers?: Record<string, string> }`

### Exporters

- `DocsExporter` — abstract base class
- `DocsExporterFS` — export flat entries to `<outdir>/<path>.md`
  - `ExportOptions` — `{ filter?: (entry: FlatEntry) => boolean }`

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
pnpm mdzilla <dir>               # browse local docs directory
pnpm mdzilla <file.md>           # render single markdown file
pnpm mdzilla gh:owner/repo       # browse GitHub repo docs
pnpm mdzilla npm:package-name    # browse npm package docs
pnpm mdzilla https://example.com # browse remote docs via HTTP
pnpm mdzilla <dir> --export <out> # export docs to flat .md files
pnpm mdzilla <source> --page /path # print a single page and exit
```

## Testing

- Uses vitest with snapshot tests (`toMatchSnapshot` / `toMatchInlineSnapshot`)
- Fixture: `test/docs/` (H3 docs site structure)
- Run: `pnpm vitest run test/nav.test.ts`
