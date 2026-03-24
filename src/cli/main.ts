#!/usr/bin/env node
import { parseArgs } from "node:util";
import { isAgent } from "std-env";
import { Collection } from "../collection.ts";
import { resolveSource } from "../source.ts";
import { writeCollection } from "../exporter.ts";
import { printUsage } from "./_usage.ts";
import { singleFileMode, renderPage, searchMode, tocMode, serverMode } from "./render.ts";

async function main() {
  // Gracefully handle broken pipes (e.g., `mdzilla ... | head`)
  process.stdout.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") process.exit(0);
    throw err;
  });

  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      export: { type: "string" },
      plain: { type: "boolean", default: isAgent || !process.stdout.isTTY },
    },
  });

  const input = positionals[0];
  const query = positionals[1];
  const plain = values.plain || input?.startsWith("npm:") || false;

  if (values.help || !input) {
    return printUsage(!!input);
  }

  const isURL = input.startsWith("http://") || input.startsWith("https://");

  // Single .md file mode
  if (input.endsWith(".md")) {
    return singleFileMode(input, plain, isURL);
  }

  const source = resolveSource(input);
  const docs = new Collection(source);
  await docs.load();

  // Export mode
  if (values.export) {
    await writeCollection(docs, values.export, { plainText: plain });
    console.log(`Exported ${docs.pages.length} pages to ${values.export}`);
    return;
  }

  // Smart resolve: positional query or auto-detected page path from URL
  let resolvedQuery = query;
  if (!resolvedQuery && isURL) {
    const urlPath = new URL(input).pathname.replace(/\/+$/, "");
    if (urlPath && urlPath !== "/") {
      resolvedQuery = urlPath;
    }
  }

  if (resolvedQuery) {
    return smartResolve(docs, resolvedQuery, plain);
  }

  // No query: server mode (interactive) or TOC (plain)
  if (plain) {
    return tocMode(docs);
  }

  return serverMode(source, docs);
}

async function smartResolve(docs: Collection, query: string, plain: boolean) {
  // 1. Try as a nav path (exact match)
  const normalized = query.startsWith("/") ? query : "/" + query;
  const resolved = await docs.resolvePage(normalized);
  if (resolved.raw) {
    return renderPage(docs, resolved, normalized, plain);
  }

  // 2. Try fuzzy nav match — if single strong match, render it directly
  const fuzzy = docs.filter(query);
  if (fuzzy.length === 1 && fuzzy[0]!.entry.page !== false) {
    const match = fuzzy[0]!;
    const page = await docs.resolvePage(match.entry.path);
    if (page.raw) {
      return renderPage(docs, page, match.entry.path, plain);
    }
  }

  // 3. Fall back to content search
  return searchMode(docs, query, plain);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
