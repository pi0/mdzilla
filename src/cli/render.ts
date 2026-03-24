import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { isAgent } from "std-env";
import { parseMeta, renderToText } from "md4x";
import type { Source } from "../sources/_base.ts";
import { extractSnippets } from "../utils.ts";
import type { Collection, FlatEntry } from "../collection.ts";
import { renderContent } from "./content.ts";
import { bold, cyan, dim, highlight } from "./_ansi.ts";
import { openInBrowser } from "./_utils.ts";

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
  const lines = await renderContent(raw, {
    slug,
    path: "/" + slug,
    title: meta.title || slug,
    order: 0,
  });
  process.stdout.write(lines.join("\n") + "\n");
}

export async function renderPage(
  docs: Collection,
  resolved: { entry?: FlatEntry; raw?: string },
  pagePath: string,
  plain?: boolean,
) {
  const { entry, raw } = resolved;
  if (!raw) {
    printNotFound(docs, pagePath);
    process.exit(1);
  }

  const normalized = pagePath.startsWith("/") ? pagePath : "/" + pagePath;
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
    const lines = await renderContent(raw, navEntry);
    process.stdout.write(lines.join("\n") + "\n");
  }
}

export async function searchMode(docs: Collection, query: string, plain?: boolean) {
  let count = 0;
  const matchedPaths: string[] = [];
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  for await (const { flat: f, titleMatch, heading } of docs.search(query)) {
    if (count === 0) {
      process.stdout.write(bold(`Search results for "${query}":\n\n`));
    }
    count++;
    matchedPaths.push(f.entry.path);

    const raw = await docs.getContent(f);
    const plainText = raw ? renderToText(raw) : "";
    const snippets = plainText ? extractSnippets(plainText, terms) : [];

    if (plain) {
      const desc = f.entry.description ? ` — ${f.entry.description}` : "";
      const badge =
        titleMatch && snippets.length > 0
          ? " (title + content)"
          : titleMatch
            ? " (title)"
            : heading
              ? ` (heading: ${heading})`
              : ` (${snippets.length} match${snippets.length !== 1 ? "es" : ""})`;
      process.stdout.write(`- **${f.entry.title}** \`${f.entry.path}\`${desc}${badge}\n`);
      for (const s of snippets) {
        process.stdout.write(`  > ${s}\n`);
      }
    } else {
      const subtitle = heading ? ` › ${cyan(heading)}` : "";
      process.stdout.write(`${bold(cyan(f.entry.title))}${subtitle} ${dim(f.entry.path)}\n`);
      for (const s of snippets) {
        process.stdout.write(`  ${highlight(s, query)}\n`);
      }
    }
  }
  if (count === 0) {
    console.log(`No results for "${query}".`);
    const suggestions = docs.suggest(query);
    if (suggestions.length > 0) {
      console.log("");
      console.log(plain ? "Related pages:" : bold("Related pages:"));
      for (const s of suggestions) {
        if (plain) {
          console.log(`  - [${s.entry.title}](${s.entry.path})`);
        } else {
          console.log(`  ${bold(cyan(s.entry.title))} ${dim(s.entry.path)}`);
        }
      }
      if (isAgent) {
        console.log("");
        console.log(
          "To read a specific page, run this command again with the page path as second argument.",
        );
      }
    }
  } else if (isAgent) {
    process.stdout.write(
      [
        "",
        "---",
        "",
        `Found ${count} page${count > 1 ? "s" : ""} matching "${query}".`,
        "To read a specific page, run this command again with the page path as second argument, for example:",
        ...[...new Set(matchedPaths)].slice(0, 3).map((p) => `  mdzilla <source> ${p}`),
        "",
      ].join("\n"),
    );
  }
}

export async function tocMode(docs: Collection) {
  const navigable = docs.pages;
  if (navigable.length === 0) {
    console.log("No pages found.");
    return;
  }

  const tocLines: string[] = ["Table of Contents", ""];
  for (const f of navigable) {
    const indent = "  ".repeat(f.depth);
    tocLines.push(`${indent}- [${f.entry.title}](${f.entry.path})`);
  }
  process.stdout.write(tocLines.join("\n") + "\n");

  // Render first page content
  const raw = await docs.getContent(navigable[0]!);
  if (raw) {
    process.stdout.write("\n" + renderToText(raw) + "\n");
  }

  if (isAgent && navigable.length > 1) {
    process.stdout.write(
      "\n---\n\nTo read a specific page, run this command again with the page path as second argument.\nTo search within pages, pass a search query as second argument.\n",
    );
  }
}

export async function serverMode(source: Source, _docs: Collection) {
  const { serve } = await import("srvx");
  const { createDocsServer } =
    (await import("../../web/.output/server/index.mjs")) as unknown as typeof import("../../web/server/entry.ts");
  const docsServer = await createDocsServer({ source });
  const server = serve({ fetch: docsServer.fetch, gracefulShutdown: false });
  await server.ready();
  await server.fetch(new Request(new URL("/api/meta", server.url))); // prefetch
  openInBrowser(server.url!);
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
    "To read a specific page, run this command again with the page path as second argument.",
    "To search within pages, pass a search query as second argument.",
    "",
  ];
  return "\n" + lines.join("\n");
}

function printNotFound(docs: Collection, pagePath: string) {
  process.stderr.write(`Page not found: ${pagePath}\n`);
  const suggestions = docs.suggest(pagePath);
  if (suggestions.length > 0) {
    process.stderr.write("\nDid you mean:\n");
    for (const s of suggestions) {
      process.stderr.write(`  - ${s.entry.title} (${s.entry.path})\n`);
    }
  }
  process.stderr.write("\nTo search within pages, pass a search query as second argument.\n");
}
