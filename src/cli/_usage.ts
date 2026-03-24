import { bold, cyan, dim } from "./_ansi.ts";
import { isAgent } from "std-env";
export function printUsage(hasInput: boolean): never {
  const bin = `${bold(cyan("npx"))} ${bold("mdzilla")}`;
  const banner = isAgent
    ? []
    : [
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
      ];
  console.log(
    [
      ...banner,
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
      `  ${cyan("--search")} ${dim("<query>")} Search pages by title or path`,
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
  process.exit(hasInput ? 0 : 1);
}
