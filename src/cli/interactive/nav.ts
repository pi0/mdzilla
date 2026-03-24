import type { FlatEntry } from "../../collection.ts";
import { bold, dim, bgGray, padTo, highlight } from "../_ansi.ts";

export function calcNavWidth(flat: FlatEntry[]): number {
  const cols = process.stdout.columns || 80;
  let max = 6; // " mdzilla"
  for (const { entry, depth } of flat) {
    // depth 0: marker(1) + space(1) + title + trailing(1)
    // depth>0: marker(1) + tree(2*depth) + title + trailing(1)
    const w = depth === 0 ? 3 + entry.title.length : 2 + 2 * depth + entry.title.length;
    if (w > max) max = w;
  }
  return Math.min(max + 2, Math.floor(cols * 0.2), 56);
}

export function renderNavPanel(
  flat: FlatEntry[],
  cursor: number,
  maxRows: number,
  width: number,
  search?: string,
  searchMatches?: Set<number>,
): string[] {
  const lines: string[] = [];

  lines.push(
    search !== undefined ? bold(" mdzilla") + "  " + dim("/") + search + "▌" : bold(" mdzilla"),
  );
  lines.push("");

  const listRows = maxRows - 2;
  let start = 0;
  if (flat.length > listRows) {
    start = Math.max(0, Math.min(cursor - Math.floor(listRows / 2), flat.length - listRows));
  }
  const end = Math.min(start + listRows, flat.length);

  // Precompute tree structure
  const isLast = computeIsLastChild(flat);
  const treePrefixes = computeTreePrefixes(flat, isLast);

  for (let i = start; i < end; i++) {
    const { entry, depth } = flat[i]!;
    const isPage = entry.page !== false;
    const active = i === cursor;

    // Compute max title width
    const prefixLen = depth === 0 ? 3 : 2 + 2 * depth;
    const maxTitle = width - prefixLen - 1;
    let displayTitle = entry.title;
    if (displayTitle.length > maxTitle && maxTitle > 1) {
      displayTitle = displayTitle.slice(0, maxTitle - 1) + "…";
    }
    const isMatch = searchMatches ? searchMatches.has(i) : false;
    const title = search ? highlight(displayTitle, search) : displayTitle;

    let label: string;
    if (depth === 0) {
      const marker = isPage ? dim("◆") : dim("◇");
      const styledTitle = search
        ? isMatch
          ? title
          : dim(displayTitle)
        : active || isPage
          ? title
          : dim(title);
      label = `${marker} ${styledTitle}`;
    } else {
      const tree = dim(treePrefixes[i]!);
      const styledTitle = search
        ? isMatch
          ? title
          : dim(displayTitle)
        : active || isPage
          ? title
          : dim(title);
      label = ` ${tree}${styledTitle}`;
    }

    lines.push(active ? bgGray(padTo(label, width)) : label);
  }

  if (flat.length > listRows) {
    lines.push(
      dim(
        ` ${start > 0 ? "↑" : " "} ${end < flat.length ? "↓" : " "} ${cursor + 1}/${flat.length}`,
      ),
    );
  }

  return lines;
}

// --- Internal ---

function computeIsLastChild(flat: FlatEntry[]): boolean[] {
  const result: boolean[] = Array.from<boolean>({ length: flat.length });
  for (let i = 0; i < flat.length; i++) {
    const d = flat[i]!.depth;
    let last = true;
    for (let j = i + 1; j < flat.length; j++) {
      if (flat[j]!.depth < d) break;
      if (flat[j]!.depth === d) {
        last = false;
        break;
      }
    }
    result[i] = last;
  }
  return result;
}

function computeTreePrefixes(flat: FlatEntry[], isLast: boolean[]): string[] {
  const prefixes: string[] = Array.from<string>({ length: flat.length });
  // Track whether each depth level continues (has more siblings below)
  const continues: boolean[] = [];

  for (let i = 0; i < flat.length; i++) {
    const d = flat[i]!.depth;
    if (d === 0) {
      prefixes[i] = "";
      continues.length = 1;
      continues[0] = !isLast[i]!;
      continue;
    }

    let prefix = "";
    // Continuation lines for ancestor levels (depth 1..d-1)
    for (let level = 1; level < d; level++) {
      prefix += continues[level] ? "│ " : "  ";
    }
    // Connector for current level (rounded corner for last child)
    prefix += isLast[i] ? "╰─" : "├─";

    prefixes[i] = prefix;
    continues[d] = !isLast[i]!;
    continues.length = d + 1;
  }

  return prefixes;
}
