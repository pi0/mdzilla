import type { FlatEntry } from "../docs/manager.ts";
import { dim, cyan, padTo, truncateTo, highlightAnsi } from "./ansi.ts";
import { calcNavWidth, renderNavPanel } from "./nav.ts";

export { calcNavWidth } from "./nav.ts";
export { renderContent } from "./content.ts";

export function renderSplit(
  flat: FlatEntry[],
  cursor: number,
  contentLines: string[],
  contentScroll: number,
  search?: string,
  focus?: "nav" | "content" | "content-search",
  contentSearch?: string,
  searchMatches?: Set<number>,
  sidebarVisible = true,
): string {
  const rows = process.stdout.rows || 24;
  const navWidth = sidebarVisible ? calcNavWidth(flat) : 0;
  const bodyRows = rows - 1;

  const navLines = sidebarVisible
    ? renderNavPanel(flat, cursor, bodyRows, navWidth, search, searchMatches)
    : [];
  const rawRight = contentLines.slice(contentScroll, contentScroll + bodyRows);
  const rightLines = contentSearch
    ? rawRight.map((l) => highlightAnsi(l, contentSearch))
    : rawRight;

  const cols = process.stdout.columns || 80;
  const contentWidth = sidebarVisible ? cols - navWidth - 3 : cols - 2;
  const isFocusContent = focus === "content" || focus === "content-search";
  const reset = "\x1B[0m";
  const output: string[] = [];
  for (let i = 0; i < bodyRows; i++) {
    const right = rightLines[i] || "";
    if (sidebarVisible) {
      output.push(
        reset +
          padTo(navLines[i] || "", navWidth) +
          reset +
          (isFocusContent ? cyan("│") : dim("│")) +
          reset +
          " " +
          truncateTo(right, contentWidth) +
          reset,
      );
    } else {
      output.push(reset + " " + truncateTo(right, contentWidth) + reset);
    }
  }

  output.push(
    search !== undefined
      ? dim("  esc") + " cancel  " + dim("enter") + " go"
      : focus === "content-search"
        ? dim("  /") + contentSearch + "▌  " + dim("esc") + " cancel  " + dim("enter") + " confirm"
        : focus === "content"
          ? dim("  ↑↓") +
            " scroll  " +
            dim("tab") +
            " links  " +
            dim("⏎") +
            " open  " +
            dim("/") +
            " search" +
            (contentSearch ? "  " + dim("n") + "/" + dim("N") + " next/prev" : "") +
            "  " +
            dim("t") +
            " sidebar  " +
            dim("⌫") +
            " back  " +
            dim("q") +
            " quit"
          : dim("  ↑↓") +
            " navigate  " +
            dim("⏎") +
            " read  " +
            dim("space") +
            " page ↓  " +
            dim("/") +
            " search  " +
            dim("t") +
            " sidebar  " +
            dim("q") +
            " quit",
  );

  const eol = "\x1B[K";
  return output.map((l) => l + eol).join("\n");
}
