#!/usr/bin/env node
import { parseArgs } from "node:util";
import { isAgent } from "std-env";
import { DocsManager } from "../docs/manager.ts";
import { DocsSourceFS, DocsSourceGit, DocsSourceHTTP, DocsSourceNpm } from "../docs/source.ts";
import { exportDocsToFS } from "../docs/exporter.ts";
import { showCursor, leaveAltScreen } from "./_ansi.ts";
import { printUsage } from "./_usage.ts";
import { singleFileMode, pageMode, plainMode } from "./render.ts";
import { interactiveMode } from "./interactive/index.ts";

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
      plain: { type: "boolean", default: isAgent || !process.stdout.isTTY },
      headless: { type: "boolean" },
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

  const source = isURL
    ? new DocsSourceHTTP(docsDir)
    : docsDir.startsWith("gh:")
      ? new DocsSourceGit(docsDir)
      : docsDir.startsWith("npm:")
        ? new DocsSourceNpm(docsDir)
        : new DocsSourceFS(docsDir);
  const docs = new DocsManager(source);
  await docs.load();

  if (exportDir) {
    await exportDocsToFS(docs, exportDir, { plainText: plain });
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

  if (pagePath && !plain) {
    return pageMode(docs, pagePath, plain);
  }

  if (plain) {
    return plainMode(docs, pagePath);
  }

  return interactiveMode(docs);
}

main().catch((err) => {
  showCursor();
  leaveAltScreen();
  console.error(err);
  process.exit(1);
});
