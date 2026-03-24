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
      `  ${bin} ${cyan("<source>")}                           ${dim("Open docs in browser")}`,
      `  ${bin} ${cyan("<source>")} ${cyan("<path>")}                    ${dim("Render a specific page")}`,
      `  ${bin} ${cyan("<source>")} ${cyan("<query>")}                   ${dim("Search docs")}`,
      `  ${bin} ${cyan("<file.md>")}                          ${dim("Render a single markdown file")}`,
      "",
      `${bold("Sources:")}`,
      `  ${cyan("./docs")}                Local directory`,
      `  ${cyan("gh:owner/repo")}         GitHub repo (looks for docs/ directory)`,
      `  ${cyan("npm:package-name")}      npm package docs`,
      `  ${cyan("https://example.com")}   Remote docs via HTTP / llms.txt`,
      "",
      `${bold("Options:")}`,
      `  ${cyan("--export")} ${dim("<dir>")}   Export docs to flat .md files`,
      `  ${cyan("--plain")}          Plain text output (auto-enabled for agents / non-TTY)`,
      `  ${cyan("-h, --help")}       Show this help message`,
      "",
      `${bold("Examples:")}`,
      `  ${bin} ${cyan("gh:unjs/h3")}                         ${dim("Open H3 docs in browser")}`,
      `  ${bin} ${cyan("gh:unjs/h3 /guide/basics")}           ${dim("Render a specific page")}`,
      `  ${bin} ${cyan("gh:unjs/h3 router")}                  ${dim("Search for 'router'")}`,
      `  ${bin} ${cyan("gh:unjs/h3 --export ./h3-docs")}      ${dim("Export to flat files")}`,
    ].join("\n"),
  );
  process.exit(hasInput ? 0 : 1);
}
