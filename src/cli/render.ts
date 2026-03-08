import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseMeta, renderToText } from "md4x";
import type { DocsManager } from "../docs/manager.ts";
import { renderContent } from "./content.ts";

export async function singleFileMode(filePath: string, plain?: boolean, isURL?: boolean) {
  const raw = isURL
    ? await fetch(filePath, {
        headers: { accept: "text/markdown, text/plain;q=0.9, text/html;q=0.8" },
      }).then((r) => r.text())
    : await readFile(filePath, "utf8");
  if (plain) {
    process.stdout.write(renderToText(raw) + "\n");
    return;
  }
  const meta = parseMeta(raw);
  const slug = isURL
    ? new URL(filePath).pathname.split("/").pop()?.replace(/\.md$/i, "") || "page"
    : basename(filePath, ".md");
  const lines = await renderContent(
    raw,
    { slug, path: "/" + slug, title: meta.title || slug, order: 0 },
    0,
  );
  process.stdout.write(lines.join("\n") + "\n");
}

export async function pageMode(docs: DocsManager, pagePath: string, plain?: boolean) {
  const normalized = pagePath.startsWith("/") ? pagePath : "/" + pagePath;
  const { entry, raw } = await docs.resolvePage(normalized);

  if (!raw) {
    console.error(`Page not found: ${pagePath}`);
    process.exit(1);
  }

  const slug = (entry?.entry.path || normalized).split("/").pop() || "";
  const navEntry = entry?.entry || {
    slug,
    path: normalized,
    title: parseMeta(raw).title || slug,
    order: 0,
  };

  if (plain) {
    process.stdout.write(renderToText(raw) + "\n");
  } else {
    const lines = await renderContent(raw, navEntry, 0);
    process.stdout.write(lines.join("\n") + "\n");
  }
}

export async function plainMode(docs: DocsManager, pagePath?: string) {
  const navigable = docs.pages;
  if (navigable.length === 0) {
    console.log("No pages found.");
    return;
  }

  // Render TOC
  const tocLines: string[] = ["Table of Contents", ""];
  for (const f of navigable) {
    const indent = "  ".repeat(f.depth);
    tocLines.push(`${indent}- [${f.entry.title}](${f.entry.path})`);
  }
  process.stdout.write(tocLines.join("\n") + "\n");

  // Render target page content (specific page or first page)
  let targetEntry = navigable[0]!;
  if (pagePath) {
    const resolved = await docs.resolvePage(pagePath);
    if (resolved.raw) {
      process.stdout.write(renderToText(resolved.raw) + "\n\n");
    }
  } else {
    const raw = await docs.getContent(targetEntry);
    if (raw) {
      process.stdout.write(renderToText(raw) + "\n\n");
    }
  }
}
