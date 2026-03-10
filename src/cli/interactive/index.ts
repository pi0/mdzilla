import type { DocsManager, FlatEntry } from "../../docs/manager.ts";
import { openInBrowser } from "../_utils.ts";
import {
  clear,
  enterAltScreen,
  leaveAltScreen,
  hideCursor,
  showCursor,
  stripAnsi,
} from "../_ansi.ts";

import { renderSplit } from "./render.ts";
import { renderContent } from "../content.ts";
import { calcNavWidth } from "./nav.ts";

export async function interactiveMode(docs: DocsManager) {
  const flat = docs.flat;

  if (flat.length === 0) {
    console.log("No pages found.");
    process.exit(0);
  }

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
    const oscRe = /\x1B\]8;;([^\x07\x1B]*?)(?:\x07|\x1B\\)/g;
    let occ = 0;
    let m: RegExpExecArray | null;
    while ((m = oscRe.exec(line)) !== null) {
      if (!m[1]) continue;
      if (occ === occurrence) {
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
    loadedPath = "";
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

  clear();
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
      openInBrowser(url);
    } else {
      const target = url.replace(/^\.\//, "/").replace(/\/$/, "");
      const idx = flat.indexOf(docs.findByPath(target)!);
      if (idx >= 0) {
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
      if (contentLinks.length > 0) {
        linkIdx = linkIdx < contentLinks.length - 1 ? linkIdx + 1 : 0;
        scrollToLink();
      }
    } else if (key === "\x1B[Z") {
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
