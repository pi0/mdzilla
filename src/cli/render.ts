import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { isAgent } from "std-env";
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
    if (isAgent) {
      process.stdout.write(agentTrailer(docs, normalized));
    }
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

  // Agent requesting a specific page: content + trailer (skip TOC)
  if (isAgent && pagePath) {
    const normalized = pagePath.startsWith("/") ? pagePath : "/" + pagePath;
    const resolved = await docs.resolvePage(normalized);
    if (resolved.raw) {
      process.stdout.write(renderToText(resolved.raw) + "\n");
    } else {
      process.stdout.write(`Page not found: ${pagePath}\n`);
    }
    process.stdout.write(agentTrailer(docs, normalized));
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
  if (pagePath) {
    const resolved = await docs.resolvePage(pagePath);
    if (resolved.raw) {
      process.stdout.write(renderToText(resolved.raw) + "\n\n");
    }
  } else {
    const raw = await docs.getContent(navigable[0]!);
    if (raw) {
      process.stdout.write(renderToText(raw) + "\n\n");
    }
  }

  if (isAgent && navigable.length > 1) {
    process.stdout.write("\n---\n\nTo read a specific page from the table of contents above, run this command again with `--page <path>`.\n");
  }
}

function agentTrailer(docs: DocsManager, currentPath?: string): string {
  const pages = docs.pages;
  if (pages.length <= 1) return "";

  const normalized = currentPath?.startsWith("/") ? currentPath : currentPath ? "/" + currentPath : undefined;
  const otherPages = pages.filter((p) => p.entry.path !== normalized);
  if (otherPages.length === 0) return "";

  const lines = [
    "---",
    "",
    "Other available pages:",
    ...otherPages.map((p) => `  - [${p.entry.title}](${p.entry.path})`),
    "",
    "To read a specific page, run this command again with `--page <path>`.",
    "To view the full table of contents, run this command without `--page`.",
    "",
  ];
  return "\n" + lines.join("\n");
}
