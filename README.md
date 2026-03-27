<p align="center">
  <img src=".assets/logo.svg" alt="mdzilla" width="200" height="200">
</p>

<h1 align="center">mdzilla</h1>

<p align="center">
Markdown browser for humans and agents.
</p>

<p align="center">

</p>

> Browse docs from local directories, GitHub repos, and remote websites — all from your terminal.

Built with [md4x](https://github.com/unjs/md4x), [giget](https://github.com/unjs/giget) and [speed-highlight](https://github.com/speed-highlight/core), [nitro](https://v3.nitro.build/), [h3](https://h3.dev/), [srvx](https://srvx.h3.dev/) and [vite](https://vite.dev/).

Supports any website with [`/llms.txt`](https://llmstxt.org/) or markdown content negotiation.

Works best with [Docus](https://docus.dev)/[Undocs](https://undocs.pages.dev/) docs sources.

## Quick Start

```sh
npx mdzilla <source>                     # Open docs in browser
npx mdzilla <source> <path>              # Render a specific page
npx mdzilla <source> <query>             # Search docs
npx mdzilla <file.md>                    # Render a single markdown file
npx mdzilla <source> --export <outdir>   # Export docs to flat .md files
```

## Agent Skill

Install the mdzilla skill for AI agents using:

```sh
npx skills install pi0/mdzilla
```

## Features

### Multiple Sources

| Source          | Syntax                       | Description                       |
| :-------------- | :--------------------------- | :-------------------------------- |
| **Local**       | `mdzilla ./docs`             | Scan a local docs directory       |
| **Single file** | `mdzilla README.md`          | Render a single markdown file     |
| **GitHub**      | `mdzilla gh:unjs/h3`         | Download and browse a GitHub repo |
| **npm**         | `mdzilla npm:h3`             | Browse an npm package's docs      |
| **HTTP**        | `mdzilla https://h3.unjs.io` | Browse remote docs via HTTP       |

### Export

Flatten any docs source into plain `.md` files:

```sh
npx mdzilla <source> --export <outdir>
```

### Smart Resolve

The second positional argument is smart-resolved: if it matches a navigation path, the page is rendered; otherwise it's treated as a search query.

```sh
npx mdzilla gh:unjs/h3 /guide/basics    # Render a specific page
npx mdzilla gh:unjs/h3 router           # Search for 'router'
```

### Web Server

Running `mdzilla <source>` without a query opens docs in the browser with a local web server:

```sh
npx mdzilla ./docs                   # Browse local docs in browser
npx mdzilla gh:unjs/h3               # Browse GitHub repo docs
```

The web UI provides a sidebar navigation, full-text search, syntax-highlighted pages, and dark/light theme support.

For local sources (`FSSource`), the server watches for file changes and live-reloads both the navigation and the current page via Server-Sent Events — no manual refresh needed.

### Plain Mode

Use `--plain` for plain text output. Auto-enabled when piping output or when called by AI agents.

```sh
npx mdzilla README.md --plain          # Pretty-print a markdown file
npx mdzilla README.md | head           # Auto-plain when piped (no TTY)
npx mdzilla gh:unjs/h3 --plain         # List all pages in plain text
```

## Programmatic API

### Export Docs

One-call export — resolves source, loads, and writes flat `.md` files:

```js
import { exportSource } from "mdzilla";

await exportSource("./docs", "./dist/docs", {
  title: "My Docs",
  filter: (e) => !e.entry.path.startsWith("/blog"),
});

// Works with any source
await exportSource("gh:unjs/h3", "./dist/h3-docs");
await exportSource("npm:h3", "./dist/h3-docs", { plainText: true });
await exportSource("https://h3.unjs.io", "./dist/h3-docs");
```

### Collection

`Collection` is the main class for working with documentation programmatically — browse the nav tree, read page content, search, and filter entries.

```js
import { Collection, resolveSource } from "mdzilla";

const docs = new Collection(resolveSource("./docs"));
await docs.load();

docs.tree; // NavEntry[] — nested navigation tree
docs.flat; // FlatEntry[] — flattened list with depth info
docs.pages; // FlatEntry[] — only navigable pages (no directory stubs)

// Read page content
const page = docs.findByPath("/guide/installation");
const content = await docs.getContent(page);

// Resolve a page flexibly (exact match, prefix stripping, direct fetch)
const { entry, raw } = await docs.resolvePage("/docs/guide/installation");

// Fuzzy search
const results = docs.filter("instal"); // sorted by match score

// Substring match (returns indices into docs.flat)
const indices = docs.matchIndices("getting started");

// Watch for changes (FSSource only) with live reload
docs.watch();
const unsub = docs.onChange((path) => {
  console.log(`Changed: ${path}`);
});
// Later: unsub() and docs.unwatch()
```

`resolveSource` auto-detects the source type from the input string (`gh:`, `npm:`, `https://`, or local path). You can also use specific source classes directly (`FSSource`, `GitSource`, `NpmSource`, `HTTPSource`).

## Development

<details>

<summary>Local development</summary>

- Clone this repository
- Install latest LTS version of [Node.js](https://nodejs.org/en/)
- Enable [Corepack](https://github.com/nodejs/corepack) using `corepack enable`
- Install dependencies using `pnpm install`
- Run interactive tests using `pnpm dev`

</details>

## License

Published under the [MIT](https://github.com/pi0/mdzilla/blob/main/LICENSE) license.
