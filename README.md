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
npx mdzilla <dir>                        # Browse local docs directory
npx mdzilla <file.md>                    # Render a single markdown file
npx mdzilla gh:owner/repo                # Browse GitHub repo docs
npx mdzilla npm:package-name             # Browse npm package docs
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

### Single Page

Print a specific page by path and exit:

```sh
npx mdzilla gh:nuxt/nuxt --page /getting-started/seo-meta
npx mdzilla gh:nuxt/nuxt --plain --page /getting-started/seo-meta
```

### Headless Mode

Use `--plain` (or `--headless`) for non-interactive output — works like `cat` but for rendered markdown. Auto-enabled when piping output or when called by AI agents.

```sh
npx mdzilla README.md --plain          # Pretty-print a markdown file
npx mdzilla README.md | head           # Auto-plain when piped (no TTY)
npx mdzilla gh:unjs/h3 --plain         # List all pages in plain text
```

### Keyboard Controls

<details>
<summary><strong>Browse mode</strong></summary>

| Key                   | Action               |
| :-------------------- | :------------------- |
| `↑` `↓` / `j` `k`     | Navigate entries     |
| `Enter` / `Tab` / `→` | Focus content        |
| `Space` / `PgDn`      | Page down            |
| `b` / `PgUp`          | Page up              |
| `g` / `G`             | Jump to first / last |
| `/`                   | Search               |
| `t`                   | Toggle sidebar       |
| `q`                   | Quit                 |

</details>

<details>
<summary><strong>Content mode</strong></summary>

| Key                 | Action                |
| :------------------ | :-------------------- |
| `↑` `↓` / `j` `k`   | Scroll                |
| `Space` / `PgDn`    | Page down             |
| `b` / `PgUp`        | Page up               |
| `g` / `G`           | Jump to top / bottom  |
| `/`                 | Search in page        |
| `n` / `N`           | Next / previous match |
| `Tab` / `Shift+Tab` | Cycle links           |
| `Enter`             | Open link             |
| `Backspace` / `Esc` | Back to nav           |
| `q`                 | Quit                  |

</details>

<details>
<summary><strong>Search mode</strong></summary>

| Key     | Action           |
| :------ | :--------------- |
| _Type_  | Filter results   |
| `↑` `↓` | Navigate results |
| `Enter` | Confirm          |
| `Esc`   | Cancel           |

</details>

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

docs.tree;              // NavEntry[] — nested navigation tree
docs.flat;              // FlatEntry[] — flattened list with depth info
docs.pages;             // FlatEntry[] — only navigable pages (no directory stubs)

// Read page content
const page = docs.findByPath("/guide/installation");
const content = await docs.getContent(page);

// Resolve a page flexibly (exact match, prefix stripping, direct fetch)
const { entry, raw } = await docs.resolvePage("/docs/guide/installation");

// Fuzzy search
const results = docs.filter("instal"); // sorted by match score

// Substring match (returns indices into docs.flat)
const indices = docs.matchIndices("getting started");
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
