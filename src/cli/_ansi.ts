import { isAgent } from "std-env";

const noColor = !!(
  process.env.NO_COLOR ||
  process.env.TERM === "dumb" ||
  !process.stdout.isTTY ||
  isAgent
);

const ESC = "\x1B[";

// Matches CSI (\x1B[...letter) and OSC (\x1B]...BEL or \x1B]...\x1B\\)
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1B(?:\[[0-9;]*[a-zA-Z]|\][^\x07\x1B]*(?:\x07|\x1B\\))/g;

export const bold = (s: string) => (noColor ? s : `${ESC}1m${s}${ESC}0m`);
export const dim = (s: string) => (noColor ? s : `${ESC}2m${s}${ESC}0m`);
export const cyan = (s: string) => (noColor ? s : `${ESC}36m${s}${ESC}0m`);
export const yellow = (s: string) => (noColor ? s : `${ESC}33m${s}${ESC}0m`);

export const stripAnsi = (s: string) => s.replace(ANSI_RE, "");

export function wrapAnsi(s: string, width: number): string[] {
  if (width <= 0 || stripAnsi(s).length <= width) return [s];

  // Tokenize into visible chars and escape sequences
  type Token = { type: "char" | "esc"; value: string };
  const tokens: Token[] = [];
  let last = 0;
  const re = new RegExp(ANSI_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(s)) !== null) {
    for (let i = last; i < match.index; i++) {
      tokens.push({ type: "char", value: s[i]! });
    }
    tokens.push({ type: "esc", value: match[0] });
    last = match.index + match[0].length;
  }
  for (let i = last; i < s.length; i++) {
    tokens.push({ type: "char", value: s[i]! });
  }

  // Build wrapped lines with style propagation
  const lines: string[] = [];
  let current = "";
  let col = 0;
  let activeStyles = "";
  let activeLink = "";

  for (const token of tokens) {
    if (token.type === "esc") {
      current += token.value;
      if (token.value.startsWith("\x1B[")) {
        if (token.value === "\x1B[0m") activeStyles = "";
        else activeStyles += token.value;
      } else if (token.value.startsWith("\x1B]8;;")) {
        activeLink =
          token.value === "\x1B]8;;\x1B\\" || token.value === "\x1B]8;;\x07" ? "" : token.value;
      }
    } else {
      if (col >= width) {
        if (activeLink) current += "\x1B]8;;\x1B\\";
        lines.push(current + "\x1B[0m");
        current = activeLink + activeStyles;
        col = 0;
      }
      current += token.value;
      col++;
    }
  }
  if (current) {
    if (activeLink) current += "\x1B]8;;\x1B\\";
    lines.push(current + "\x1B[0m");
  }

  return lines;
}

export function highlight(text: string, query: string): string {
  if (!query) return text;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let result = "";
  let last = 0;
  let pos = 0;
  while ((pos = lowerText.indexOf(lowerQuery, last)) >= 0) {
    result += text.slice(last, pos) + bold(yellow(text.slice(pos, pos + query.length)));
    last = pos + query.length;
  }
  return last === 0 ? text : result + text.slice(last);
}
