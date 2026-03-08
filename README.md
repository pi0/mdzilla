<p align="center">
<img src="https://raw.githubusercontent.com/unjs/mdzilla/main/.assets/logo.svg" width="200" alt="mdzilla">
</p>

<h1 align="center">mdzilla</h1>

<p align="center">
Markdown browser for humans and agents.
</p>

<p align="center">

<!-- automd:badges color=yellow -->

[![npm version](https://img.shields.io/npm/v/mdzilla?color=yellow)](https://npmjs.com/package/mdzilla)
[![npm downloads](https://img.shields.io/npm/dm/mdzilla?color=yellow)](https://npm.chart.dev/mdzilla)

<!-- /automd -->

</p>

> Browse local directories, GitHub repos, and remote websites — all from your terminal. Built on [md4x](https://github.com/unjs/md4x), [mdream](https://github.com/harlan-zw/mdream), [giget](https://github.com/unjs/giget) and [speed-highlight](https://github.com/speed-highlight/core).

Works best with [Docus](https://docus.dev) and [Undocs](https://undocs.pages.dev/) sources or any website supporting [`/llms.txt`](https://llmstxt.org/).

## Quick Start

```sh
npx mdzilla <dir>                 # Browse local docs directory
npx mdzilla <file.md>             # Render a single markdown file
npx mdzilla gh:owner/repo         # Browse GitHub repo docs
npx mdzilla https://example.com   # Browse remote docs via HTTP
```

## Features

### Multiple Sources

| Source          | Syntax                       | Description                       |
| :-------------- | :--------------------------- | :-------------------------------- |
| **Local**       | `mdzilla ./docs`             | Scan a local docs directory       |
| **Single file** | `mdzilla README.md`          | Render a single markdown file     |
| **GitHub**      | `mdzilla gh:unjs/h3`         | Download and browse a GitHub repo |
| **HTTP**        | `mdzilla https://h3.unjs.io` | Browse remote docs via HTTP       |

### Export

Flatten any docs source into plain `.md` files:

```sh
npx mdzilla <source> --export <outdir>
```

### Headless Mode

Use `--plain` for non-interactive output — auto-enabled when called by AI agents or when stdout is not a TTY.

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

```js
import { DocsManager, DocsSourceFS } from "mdzilla";

const docs = new DocsManager(new DocsSourceFS("./docs"));
await docs.load();

// Browse the navigation tree
console.log(docs.tree);

// Get page content
const content = await docs.getContent(docs.flat[0]);
```

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
