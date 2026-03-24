import { renderToAnsi } from "md4x";
import { highlightText } from "@speed-highlight/core/terminal";
import type { NavEntry } from "../nav.ts";
import { dim, wrapAnsi } from "./_ansi.ts";

export async function renderContent(content: string, entry: NavEntry): Promise<string[]> {
  const cols = process.stdout.columns || 80;

  // Extract code blocks and languages from markdown source
  const codeBlocks: { lang: string; code: string }[] = [];
  const codeRe = /```(\w+)[^\n]*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = codeRe.exec(content)) !== null) {
    codeBlocks.push({ lang: m[1]!, code: m[2]! });
  }

  // Highlight code blocks in parallel
  const highlights = new Map<string, string>();
  if (codeBlocks.length > 0) {
    await Promise.all(
      codeBlocks.map(({ lang, code }) =>
        highlightText(code, lang as Parameters<typeof highlightText>[1])
          .then((h) => highlights.set(code, h))
          .catch(() => {}),
      ),
    );
  }

  // Render markdown to ANSI without highlighter callback to avoid
  // highlighted ANSI codes corrupting md4x's internal rendering state
  const output = renderToAnsi(content);

  // Post-process: replace dim code blocks (\x1B[2m...\x1B[22m) with highlighted versions
  const rawLines = output.split("\n");
  const lines: string[] = [];
  lines.push(dim(entry.path));
  lines.push("");

  let inDim = false;
  let dimLines: string[] = [];
  let blockIdx = 0;

  for (const rawLine of rawLines) {
    // Detect code block dim start: line contains \x1B[2m but NOT \x1B[22m
    // (inline dim like bullets `\x1B[2m* \x1B[22m...` have both on same line)
    if (!inDim && rawLine.includes("\x1B[2m") && !rawLine.includes("\x1B[22m")) {
      inDim = true;
      dimLines = [rawLine];
      continue;
    }

    if (inDim) {
      if (rawLine.startsWith("\x1B[22m")) {
        // End of dim block — try to replace with highlighted version
        inDim = false;
        const block = codeBlocks[blockIdx];
        const hl = block ? highlights.get(block.code) : undefined;
        if (hl) {
          const hlLines = hl.split("\n");
          if (hlLines.length > 0 && hlLines[hlLines.length - 1] === "") {
            hlLines.pop();
          }
          for (const hlLine of hlLines) {
            for (const w of wrapAnsi("  " + hlLine, cols)) {
              lines.push(w + "\x1B[0m");
            }
          }
        } else {
          // No highlight — output original dim lines
          for (const dl of dimLines) {
            for (const w of wrapAnsi(dl, cols)) {
              lines.push(w + "\x1B[0m");
            }
          }
        }
        blockIdx++;
        lines.push("");
      } else {
        dimLines.push(rawLine);
      }
      continue;
    }

    for (const w of wrapAnsi(rawLine, cols)) {
      lines.push(w + "\x1B[0m");
    }
  }

  return lines;
}
