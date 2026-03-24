#!/usr/bin/env node
import { parseArgs } from "node:util";
import { isAgent } from "std-env";
import { Collection } from "../collection.ts";
import { resolveSource } from "../source.ts";
import { writeCollection } from "../exporter.ts";
import { showCursor, leaveAltScreen } from "./_ansi.ts";
import { printUsage } from "./_usage.ts";
import { singleFileMode, pageMode, plainMode, searchMode } from "./render.ts";
import { interactiveMode } from "./interactive/index.ts";
import { openInBrowser } from "./_utils.ts";

async function main() {
  // Gracefully handle broken pipes (e.g., `mdzilla ... | head`)
  process.stdout.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") process.exit(0);
    throw err;
  });

  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      help: { type: "boolean", short: "h" },
      export: { type: "string" },
      page: { type: "string", short: "p" },
      search: { type: "string", short: "s" },
      plain: { type: "boolean", default: isAgent || !process.stdout.isTTY },
      headless: { type: "boolean" },
      tui: { type: "boolean" },
    },
    allowPositionals: true,
  });

  const exportDir = values.export;
  const docsDir = positionals[0];
  const plain = values.plain || values.headless || docsDir?.startsWith("npm:") || false;
  if (values.help || !docsDir) {
    return printUsage(!!docsDir);
  }

  const isURL = docsDir.startsWith("http://") || docsDir.startsWith("https://");

  // Single .md file mode
  if (docsDir.endsWith(".md")) {
    return singleFileMode(docsDir, plain, isURL);
  }

  const source = resolveSource(docsDir);
  const docs = new Collection(source);
  await docs.load();

  if (exportDir) {
    await writeCollection(docs, exportDir, { plainText: plain });
    console.log(`Exported ${docs.pages.length} pages to ${exportDir}`);
    return;
  }

  // Auto-detect page path from URL (e.g., https://example.com/docs/page → /docs/page)
  let pagePath = values.page;
  if (!pagePath && isURL) {
    const urlPath = new URL(docsDir).pathname.replace(/\/+$/, "");
    if (urlPath && urlPath !== "/") {
      pagePath = urlPath;
    }
  }

  if (values.search) {
    return searchMode(docs, values.search);
  }

  if (pagePath && !plain) {
    return pageMode(docs, pagePath, plain);
  }

  if (plain) {
    return plainMode(docs, pagePath);
  }

  if (values.tui) {
    interactiveMode(docs);
  } else {
    const { serve } = await import("srvx");
    const { createDocsServer } =
      (await import("../../web/.output/server/index.mjs")) as unknown as typeof import("../../web/server/entry.ts");
    const docsServer = await createDocsServer({
      source,
    });
    const server = serve({ fetch: docsServer.fetch, gracefulShutdown: false });
    await server.ready();
    await server.fetch(new Request(new URL("/api/meta", server.url))); // prefetch
    openInBrowser(server.url!);
  }
}

main().catch((err) => {
  showCursor();
  leaveAltScreen();
  console.error(err);
  process.exit(1);
});
