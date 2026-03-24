import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { isAgent } from "std-env";
import { parseMeta, renderToText } from "md4x";
import type { Collection } from "../collection.ts";
import { renderContent } from "./content.ts";
import { bold, cyan, dim, highlight } from "./_ansi.ts";

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

export async function pageMode(docs: Collection, pagePath: string, plain?: boolean) {
  const normalized = pagePath.startsWith("/") ? pagePath : "/" + pagePath;
  const { entry, raw } = await docs.resolvePage(normalized);

  if (!raw) {
    printNotFound(docs, pagePath, normalized);
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

export async function plainMode(docs: Collection, pagePath?: string) {
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
      process.stdout.write(agentTrailer(docs, normalized));
    } else {
      printNotFound(docs, pagePath, normalized);
    }
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
    process.stdout.write(
      "\n---\n\nTo read a specific page from the table of contents above, run this command again with `--page <path>`.\nTo search within pages, use `--search <query>`.\n",
    );
  }
}

export async function searchMode(docs: Collection, query: string) {
  let count = 0;
  const matchedPaths: string[] = [];
  for await (const { flat: f, titleMatch, contentMatches } of docs.search(query)) {
    if (count === 0) {
      process.stdout.write(bold(`Search results for "${query}":\n\n`));
    }
    count++;
    matchedPaths.push(f.entry.path);

    if (isAgent) {
      // Agent-friendly: clear page identity, description, and context
      const desc = f.entry.description ? ` — ${f.entry.description}` : "";
      const badge = titleMatch && contentMatches.length > 0
        ? " (title + content)"
        : titleMatch
          ? " (title)"
          : ` (${contentMatches.length} content match${contentMatches.length > 1 ? "es" : ""})`;
      process.stdout.write(`- **${f.entry.title}** \`${f.entry.path}\`${desc}${badge}\n`);
      for (const m of contentMatches.slice(0, 3)) {
        process.stdout.write(`  > ${m.text}\n`);
        for (const ctx of m.context) {
          if (ctx) process.stdout.write(`    ${ctx}\n`);
        }
      }
      if (contentMatches.length > 3) {
        process.stdout.write(`  ... ${contentMatches.length - 3} more matches\n`);
      }
    } else {
      process.stdout.write(`${bold(cyan(f.entry.title))} ${dim(f.entry.path)}\n`);
      for (const m of contentMatches.slice(0, 3)) {
        process.stdout.write(`  ${highlight(m.text, query)}\n`);
      }
      if (contentMatches.length > 3) {
        process.stdout.write(`  ${dim(`... ${contentMatches.length - 3} more matches`)}\n`);
      }
    }
  }
  if (count === 0) {
    console.log(`No results for "${query}".`);
  } else if (isAgent) {
    process.stdout.write(
      [
        "",
        "---",
        "",
        `Found ${count} page${count > 1 ? "s" : ""} matching "${query}".`,
        "To read a specific page, run this command again with `--page <path>`, for example:",
        ...[...new Set(matchedPaths)].slice(0, 3).map((p) => `  --page ${p}`),
        "",
      ].join("\n"),
    );
  }
}

function agentTrailer(docs: Collection, currentPath?: string): string {
  const pages = docs.pages;
  if (pages.length <= 1) return "";

  const normalized = currentPath?.startsWith("/")
    ? currentPath
    : currentPath
      ? "/" + currentPath
      : undefined;
  const otherPages = pages.filter((p) => p.entry.path !== normalized);
  if (otherPages.length === 0) return "";

  const lines = [
    "---",
    "",
    "Other available pages:",
    ...otherPages.map((p) => `  - [${p.entry.title}](${p.entry.path})`),
    "",
    "To read a specific page, run this command again with `--page <path>`.",
    "To search within pages, run this command again with `--search <query>`.",
    "To view the full table of contents, run this command without `--page`.",
    "",
  ];
  return "\n" + lines.join("\n");
}

function printNotFound(docs: Collection, pagePath: string, normalized: string) {
  process.stderr.write(`Page not found: ${pagePath}\n`);
  // Suggest similar pages from path segments
  const segments = normalized.split("/").filter(Boolean);
  const keywords = segments.flatMap((s) => s.split("-")).filter(Boolean);
  let suggestions = docs.filter(segments.at(-1) || normalized);
  if (suggestions.length === 0) {
    suggestions = docs.pages.filter((f) =>
      keywords.some(
        (kw) =>
          f.entry.title.toLowerCase().includes(kw) ||
          f.entry.path.toLowerCase().includes(kw),
      ),
    );
  }
  if (suggestions.length > 0) {
    const shown = suggestions.slice(0, 5);
    process.stderr.write("\nDid you mean:\n");
    for (const s of shown) {
      process.stderr.write(`  - ${s.entry.title} (${s.entry.path})\n`);
    }
    if (suggestions.length > 5) {
      process.stderr.write(`  ... ${suggestions.length - 5} more\n`);
    }
  }
  process.stderr.write(
    [
      "",
      "To search within pages, use `--search <query>`.",
      "To view the full table of contents, run this command without `--page`.",
      "",
    ].join("\n"),
  );
}
