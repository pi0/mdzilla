#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { parseMeta, renderToText } from "md4x";
import { isAgent } from "std-env";
import { DocsManager } from "../docs/manager.ts";
import { DocsSourceFS, DocsSourceGit, DocsSourceHTTP, DocsSourceNpm } from "../docs/source.ts";
import { DocsExporterFS } from "../docs/exporter.ts";
import {
  bold,
  cyan,
  dim,
  clear,
  enterAltScreen,
  leaveAltScreen,
  hideCursor,
  showCursor,
  stripAnsi,
} from "./ansi.ts";
import type { FlatEntry } from "../docs/manager.ts";
import { renderSplit, renderContent, calcNavWidth } from "./render.ts";

async function main() {
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
    const bin = `${bold(cyan("npx"))} ${bold("mdzilla")}`;
    console.log(
      [
        dim("        /\\    /\\    /\\"),
        dim("       /  \\  /  \\  /  \\"),
        dim("      ╭────────────────╮"),
        dim("      │") + bold(" # ") + dim(" ░░░░░       │"),
        dim("      │    ░░░░░░░░    │"),
        dim("      │    ░░░░░░      │"),
        dim("      │    ░░░░░░░     │"),
        dim("      │    ░░░░        │"),
        dim("      │   ") + cyan("◉") + dim("        ") + cyan("◉") + dim("   │"),
        dim("      ╰─┬──┬──┬──┬──┬──╯"),
        dim("        ▽  ▽  ▽  ▽  ▽"),
        "",
        `  ${bold("mdzilla")} ${dim("— Markdown browser for humans and agents")}`,
        "",
        `${bold("Usage:")}`,
        `  ${bin} ${cyan("<dir>")}                 ${dim("Browse local docs directory")}`,
        `  ${bin} ${cyan("<file.md>")}             ${dim("Render a single markdown file")}`,
        `  ${bin} ${cyan("gh:owner/repo")}         ${dim("Browse GitHub repo docs")}`,
        `  ${bin} ${cyan("npm:package-name")}      ${dim("Browse npm package docs")}`,
        `  ${bin} ${cyan("https://example.com")}   ${dim("Browse remote docs via HTTP")}`,
        "",
        `${bold("Options:")}`,
        `  ${cyan("--export")} ${dim("<dir>")}   Export docs to flat .md files`,
        `  ${cyan("--page")} ${dim("<path>")}    Print a single page and exit`,
        `  ${cyan("--plain")}          Plain text output (no TUI)`,
        `  ${cyan("--headless")}       Alias for --plain`,
        `  ${cyan("-h, --help")}       Show this help message`,
        "",
        `${bold("Remarks:")}`,
        `  ${dim("Headless mode is auto-enabled when called by AI agents or when stdout is not a TTY.")}`,
        `  ${dim("GitHub source (gh:) looks for a docs/ directory in the repository.")}`,
        `  ${dim("HTTP source tries /llms.txt first, then fetches with Accept: text/markdown,")}`,
        `  ${dim("and falls back to HTML-to-markdown conversion.")}`,
      ].join("\n"),
    );
    process.exit(docsDir ? 0 : 1);
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
    const exporter = new DocsExporterFS(exportDir);
    await exporter.export(docs, { plainText: plain });
    console.log(
      `Exported ${docs.flat.filter((f) => f.entry.page !== false).length} pages to ${exportDir}`,
    );
    return;
  }

  if (values.page) {
    return pageMode(docs, values.page, plain);
  }

  if (plain) {
    return plainMode(docs);
  }

  const flat = docs.flat;

  if (flat.length === 0) {
    console.log("No pages found.");
    process.exit(0);
  }

  const extractLinks = (lines: string[]) => {
    const links: { line: number; url: string; occurrence: number }[] = [];
    const re = /\x1B\]8;;([^\x07\x1B]+?)(?:\x07|\x1B\\)/g;
    for (let i = 0; i < lines.length; i++) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      let occ = 0;
      while ((m = re.exec(lines[i]!)) !== null) {
        links.push({ line: i, url: m[1]!, occurrence: occ++ });
      }
    }
    return links;
  };

  const highlightLinkOnLine = (line: string, occurrence: number): string => {
    // Find the Nth OSC 8 link opener and wrap its text with reverse video
    const oscRe = /\x1B\]8;;([^\x07\x1B]*?)(?:\x07|\x1B\\)/g;
    let occ = 0;
    let m: RegExpExecArray | null;
    while ((m = oscRe.exec(line)) !== null) {
      if (!m[1]) continue; // closer (empty URL)
      if (occ === occurrence) {
        // Found the opener — find the closer
        const openerEnd = m.index + m[0].length;
        const closer = oscRe.exec(line);
        if (!closer) break;
        return (
          line.slice(0, openerEnd) +
          "\x1B[7m" +
          line.slice(openerEnd, closer.index) +
          "\x1B[27m" +
          line.slice(closer.index)
        );
      }
      occ++;
    }
    return line;
  };

  const isNavigable = (list: FlatEntry[], i: number) => list[i]?.entry.page !== false;

  const nextNavigable = (list: FlatEntry[], from: number, dir: 1 | -1) => {
    let i = from + dir;
    while (i >= 0 && i < list.length) {
      if (isNavigable(list, i)) return i;
      i += dir;
    }
    return from;
  };

  const firstNavigable = (list: FlatEntry[]) => {
    for (let i = 0; i < list.length; i++) {
      if (isNavigable(list, i)) return i;
    }
    return 0;
  };

  let cursor = firstNavigable(flat);
  let searching = false;
  let searchQuery = "";
  let searchMatches: number[] = [];
  let contentScroll = 0;
  let contentLines: string[] = [];
  let loadedPath = "";
  let focusContent = false;
  let contentSearching = false;
  let contentSearchQuery = "";
  let contentMatches: number[] = [];
  let contentMatchIdx = 0;
  let sidebarVisible = true;
  let contentLinks: { line: number; url: string; occurrence: number }[] = [];
  let linkIdx = -1; // -1 = no link selected

  const findContentMatches = (query: string): number[] => {
    if (!query) return [];
    const lower = query.toLowerCase();
    const matches: number[] = [];
    for (let i = 0; i < contentLines.length; i++) {
      if (stripAnsi(contentLines[i]!).toLowerCase().includes(lower)) {
        matches.push(i);
      }
    }
    return matches;
  };

  const scrollToMatch = () => {
    if (contentMatches.length === 0) return;
    const rows = process.stdout.rows || 24;
    const line = contentMatches[contentMatchIdx]!;
    // Center the match in the viewport
    contentScroll = Math.max(
      0,
      Math.min(line - Math.floor(rows / 2), contentLines.length - rows + 2),
    );
  };

  process.stdin.setRawMode(true);
  process.stdin.resume();
  enterAltScreen();
  hideCursor();

  const draw = () => {
    // Apply link highlight if a link is selected
    let displayLines = contentLines;
    if (linkIdx >= 0 && linkIdx < contentLinks.length) {
      const link = contentLinks[linkIdx]!;
      displayLines = [...contentLines];
      displayLines[link.line] = highlightLinkOnLine(displayLines[link.line]!, link.occurrence);
    }
    const frame = renderSplit(
      flat,
      cursor,
      displayLines,
      contentScroll,
      searching ? searchQuery : undefined,
      contentSearching ? "content-search" : focusContent ? "content" : "nav",
      contentSearching ? contentSearchQuery : contentSearchQuery || undefined,
      searching ? new Set(searchMatches) : undefined,
      sidebarVisible,
    );
    // Move cursor home and overwrite in place to avoid flash
    process.stdout.write(`\x1B[H${frame}`);
  };

  const loadContent = (entry?: FlatEntry) => {
    if (!entry?.filePath || entry.entry.page === false) {
      if (loadedPath !== "") {
        contentLines = [];
        contentScroll = 0;
        loadedPath = "";
        draw();
      }
      return;
    }
    if (entry.filePath === loadedPath) return;
    const targetPath = entry.filePath;
    docs.getContent(entry).then(async (raw) => {
      if (!raw || flat[cursor]?.filePath !== targetPath) return;
      contentLines = await renderContent(raw, entry.entry, sidebarVisible ? calcNavWidth(flat) : 0);
      contentScroll = 0;
      contentSearchQuery = "";
      contentMatches = [];
      contentLinks = extractLinks(contentLines);
      linkIdx = -1;
      loadedPath = targetPath;
      draw();
    });
  };

  let cleaned = false;
  const cleanup = (code = 0) => {
    if (cleaned) return;
    cleaned = true;
    showCursor();
    leaveAltScreen();
    process.exit(code);
  };

  const reloadContent = () => {
    const entry = flat[cursor];
    if (!entry?.filePath || entry.entry.page === false) return;
    docs.invalidate(entry.filePath);
    loadedPath = ""; // force reload
    loadContent(entry);
  };

  process.on("SIGINT", () => cleanup());
  process.on("SIGTERM", () => cleanup());
  process.on("uncaughtException", (err) => {
    if (cleaned) return;
    cleaned = true;
    showCursor();
    leaveAltScreen();
    console.error(err);
    process.exit(1);
  });
  process.on("unhandledRejection", (err) => {
    if (cleaned) return;
    cleaned = true;
    showCursor();
    leaveAltScreen();
    console.error(err);
    process.exit(1);
  });
  process.stdout.on("resize", () => {
    reloadContent();
    draw();
  });

  clear(); // initial clear
  draw();
  loadContent(flat[cursor]);

  process.stdin.on("data", (data: Buffer) => {
    const key = data.toString();
    if (key === "\x03") return cleanup();

    if (searching) {
      handleSearch(key);
    } else if (contentSearching) {
      handleContentSearch(key);
    } else if (focusContent) {
      handleContent(key);
    } else {
      handleNav(key);
    }

    draw();
  });

  function handleNav(key: string) {
    const rows = process.stdout.rows || 24;
    const maxScroll = Math.max(0, contentLines.length - rows + 2);

    if (key === "q") return cleanup();
    if (key === "/") {
      searching = true;
      searchQuery = "";
      searchMatches = [];
      showCursor();
    } else if (key === "\x1B[A" || key === "k") {
      cursor = nextNavigable(flat, cursor, -1);
      loadContent(flat[cursor]);
    } else if (key === "\x1B[B" || key === "j") {
      cursor = nextNavigable(flat, cursor, 1);
      loadContent(flat[cursor]);
    } else if (key === "\r" || key === "\n" || key === "\t" || key === "\x1B[C") {
      if (contentLines.length > 0) {
        focusContent = true;
      }
    } else if (key === " " || key === "\x1B[6~") {
      contentScroll = Math.min(maxScroll, contentScroll + rows - 2);
    } else if (key === "b" || key === "\x1B[5~") {
      contentScroll = Math.max(0, contentScroll - rows + 2);
    } else if (key === "g") {
      cursor = firstNavigable(flat);
      loadContent(flat[cursor]);
    } else if (key === "G") {
      for (let i = flat.length - 1; i >= 0; i--) {
        if (isNavigable(flat, i)) {
          cursor = i;
          break;
        }
      }
      loadContent(flat[cursor]);
    } else if (key === "t") {
      sidebarVisible = !sidebarVisible;
      reloadContent();
    }
  }

  const scrollToLink = () => {
    if (linkIdx < 0 || linkIdx >= contentLinks.length) return;
    const rows = process.stdout.rows || 24;
    const line = contentLinks[linkIdx]!.line;
    if (line < contentScroll || line >= contentScroll + rows - 2) {
      contentScroll = Math.max(
        0,
        Math.min(line - Math.floor(rows / 3), contentLines.length - rows + 2),
      );
    }
  };

  const activateLink = (url: string) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      // External link — open with OS command
      try {
        execSync(`open ${JSON.stringify(url)}`, { stdio: "ignore" });
      } catch {}
    } else {
      // Relative link — navigate to matching entry
      const target = url.replace(/^\.\//, "/").replace(/\/$/, "");
      const idx = flat.findIndex((f) => f.entry.path === target || f.entry.path === target + "/");
      if (idx >= 0 && isNavigable(flat, idx)) {
        cursor = idx;
        focusContent = false;
        linkIdx = -1;
        loadContent(flat[cursor]);
      }
    }
  };

  function handleContent(key: string) {
    const rows = process.stdout.rows || 24;
    const maxScroll = Math.max(0, contentLines.length - rows + 2);

    if (key === "\x7F" || key === "\b" || key === "\x1B[D" || key === "\x1B") {
      focusContent = false;
      linkIdx = -1;
      contentSearchQuery = "";
      contentMatches = [];
    } else if (key === "\t") {
      // Tab: cycle to next link
      if (contentLinks.length > 0) {
        linkIdx = linkIdx < contentLinks.length - 1 ? linkIdx + 1 : 0;
        scrollToLink();
      }
    } else if (key === "\x1B[Z") {
      // Shift+Tab: cycle to previous link
      if (contentLinks.length > 0) {
        linkIdx = linkIdx > 0 ? linkIdx - 1 : contentLinks.length - 1;
        scrollToLink();
      }
    } else if ((key === "\r" || key === "\n") && linkIdx >= 0 && linkIdx < contentLinks.length) {
      activateLink(contentLinks[linkIdx]!.url);
    } else if (key === "\x1B[A" || key === "k") {
      contentScroll = Math.max(0, contentScroll - 1);
    } else if (key === "\x1B[B" || key === "j") {
      contentScroll = Math.min(maxScroll, contentScroll + 1);
    } else if (key === " " || key === "\x1B[6~") {
      contentScroll = Math.min(maxScroll, contentScroll + rows - 2);
    } else if (key === "b" || key === "\x1B[5~") {
      contentScroll = Math.max(0, contentScroll - rows + 2);
    } else if (key === "/") {
      contentSearching = true;
      contentSearchQuery = "";
      contentMatches = [];
      contentMatchIdx = 0;
      showCursor();
    } else if (key === "n" && contentMatches.length > 0) {
      contentMatchIdx = (contentMatchIdx + 1) % contentMatches.length;
      scrollToMatch();
    } else if (key === "N" && contentMatches.length > 0) {
      contentMatchIdx = (contentMatchIdx - 1 + contentMatches.length) % contentMatches.length;
      scrollToMatch();
    } else if (key === "g") {
      contentScroll = 0;
    } else if (key === "G") {
      contentScroll = maxScroll;
    } else if (key === "t") {
      sidebarVisible = !sidebarVisible;
      reloadContent();
    } else if (key === "q") {
      return cleanup();
    }
  }

  function handleContentSearch(key: string) {
    if (key === "\x1B") {
      contentSearching = false;
      contentSearchQuery = "";
      contentMatches = [];
      hideCursor();
    } else if (key === "\r" || key === "\n") {
      contentSearching = false;
      hideCursor();
      // Keep matches for n/N navigation
    } else if (key === "\x7F" || key === "\b") {
      contentSearchQuery = contentSearchQuery.slice(0, -1);
      contentMatches = findContentMatches(contentSearchQuery);
      contentMatchIdx = 0;
      scrollToMatch();
    } else if (key === "\x1B[A") {
      if (contentMatches.length > 0) {
        contentMatchIdx = (contentMatchIdx - 1 + contentMatches.length) % contentMatches.length;
        scrollToMatch();
      }
    } else if (key === "\x1B[B") {
      if (contentMatches.length > 0) {
        contentMatchIdx = (contentMatchIdx + 1) % contentMatches.length;
        scrollToMatch();
      }
    } else if (key.length === 1 && key >= " ") {
      contentSearchQuery += key;
      contentMatches = findContentMatches(contentSearchQuery);
      contentMatchIdx = 0;
      scrollToMatch();
    }
  }

  function updateSearchMatches() {
    searchMatches = docs.matchIndices(searchQuery);
    if (searchMatches.length > 0) {
      cursor = searchMatches[0]!;
    } else if (!searchQuery) {
      cursor = firstNavigable(flat);
    }
    loadContent(flat[cursor]);
  }

  function nextSearchMatch(dir: 1 | -1) {
    if (searchMatches.length === 0) return;
    const curIdx = searchMatches.indexOf(cursor);
    if (curIdx < 0) {
      cursor = searchMatches[0]!;
    } else {
      const next = curIdx + dir;
      cursor = searchMatches[(next + searchMatches.length) % searchMatches.length]!;
    }
    loadContent(flat[cursor]);
  }

  function handleSearch(key: string) {
    if (key === "\x1B" || key === "\x1B[D") {
      searching = false;
      searchMatches = [];
      cursor = firstNavigable(flat);
      hideCursor();
      loadContent(flat[cursor]);
    } else if (key === "\r" || key === "\n") {
      searching = false;
      searchMatches = [];
      hideCursor();
      loadContent(flat[cursor]);
    } else if (key === "\x7F" || key === "\b") {
      searchQuery = searchQuery.slice(0, -1);
      updateSearchMatches();
    } else if (key === "\x1B[A") {
      nextSearchMatch(-1);
    } else if (key === "\x1B[B") {
      nextSearchMatch(1);
    } else if (key.length === 1 && key >= " ") {
      searchQuery += key;
      updateSearchMatches();
    }
  }
}

async function singleFileMode(filePath: string, plain?: boolean, isURL?: boolean) {
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

async function pageMode(docs: DocsManager, pagePath: string, plain?: boolean) {
  const normalized = pagePath.startsWith("/") ? pagePath : "/" + pagePath;
  const { entry, raw } = await _resolvePagePath(docs, normalized);

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

async function plainMode(docs: DocsManager) {
  const flat = docs.flat;
  const navigable = flat.filter((f) => f.entry.page !== false);
  if (navigable.length === 0) {
    console.log("No pages found.");
    return;
  }

  // Render TOC
  const tocLines: string[] = ["# Table of Contents", ""];
  for (const f of navigable) {
    const indent = "  ".repeat(f.depth);
    tocLines.push(`${indent}- [${f.entry.title}](${f.entry.path})`);
  }
  process.stdout.write(tocLines.join("\n") + "\n\n---\n\n");

  // Render first page content
  const raw = await docs.getContent(navigable[0]!);
  if (raw) {
    process.stdout.write(renderToText(raw) + "\n");
  }
}

async function _resolvePagePath(
  docs: DocsManager,
  path: string,
): Promise<{ entry?: FlatEntry; raw?: string }> {
  const _find = (p: string) =>
    docs.flat.find(
      (f) => f.entry.page !== false && (f.entry.path === p || f.entry.path === p + "/"),
    );

  // Try exact match first
  const entry = _find(path);
  if (entry) {
    const raw = await docs.getContent(entry);
    if (raw) return { entry, raw };
  }

  // Try stripping common prefixes (e.g. /docs/guide/... → /guide/...)
  const prefixed = path.match(/^\/[^/]+(\/.+)$/);
  if (prefixed) {
    const stripped = _find(prefixed[1]!);
    if (stripped) {
      const raw = await docs.getContent(stripped);
      if (raw) return { entry: stripped, raw };
    }
  }

  // Fallback: fetch directly from source (works for HTTP sources with uncrawled paths)
  const raw = await docs.source.readContent(path).catch(() => undefined);
  if (raw) return { raw };

  return {};
}

main().catch((err) => {
  showCursor();
  leaveAltScreen();
  console.error(err);
  process.exit(1);
});
