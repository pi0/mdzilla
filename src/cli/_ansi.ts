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

export const clear = () => process.stdout.write(`${ESC}2J${ESC}3J${ESC}H`);
export const enterAltScreen = () => process.stdout.write(`${ESC}?1049h`);
export const leaveAltScreen = () => process.stdout.write(`${ESC}?1049l`);
export const hideCursor = () => process.stdout.write(`${ESC}?25l`);
export const showCursor = () => process.stdout.write(`${ESC}?25h`);
export const enableMouse = () => process.stdout.write(`${ESC}?1000h${ESC}?1006h`);
export const disableMouse = () => process.stdout.write(`${ESC}?1006l${ESC}?1000l`);
export const bold = (s: string) => (noColor ? s : `${ESC}1m${s}${ESC}0m`);
export const dim = (s: string) => (noColor ? s : `${ESC}2m${s}${ESC}0m`);
export const cyan = (s: string) => (noColor ? s : `${ESC}36m${s}${ESC}0m`);
export const yellow = (s: string) => (noColor ? s : `${ESC}33m${s}${ESC}0m`);
export const bgGray = (s: string) => {
  if (noColor) return s;
  const bg = `${ESC}48;5;237m`;
  // Re-apply bg after any inner resets so nested styles don't kill it
  const inner = s.replaceAll(`${ESC}0m`, `${ESC}0m${bg}`);
  return `${bg}${inner}${ESC}0m`;
};

export const stripAnsi = (s: string) => s.replace(ANSI_RE, "");

export const visibleLength = (s: string) => stripAnsi(s).length;

export const padRow = (s: string) => {
  const cols = process.stdout.columns || 80;
  const visible = visibleLength(s);
  return visible < cols ? s + " ".repeat(cols - visible) : s;
};

export function padTo(s: string, width: number): string {
  const visible = visibleLength(s);
  if (visible >= width) return truncateTo(s, width);
  return s + " ".repeat(width - visible);
}

export function truncateTo(s: string, width: number): string {
  if (visibleLength(s) <= width) return s;
  const lines = wrapAnsi(s, width);
  return lines[0] || "";
}

export function wrapAnsi(s: string, width: number): string[] {
  if (width <= 0 || visibleLength(s) <= width) return [s];

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

  let activeLink = ""; // tracks open OSC 8 hyperlink

  for (const token of tokens) {
    if (token.type === "esc") {
      current += token.value;
      if (token.value.startsWith("\x1B[")) {
        // Track SGR styles
        if (token.value === "\x1B[0m") activeStyles = "";
        else activeStyles += token.value;
      } else if (token.value.startsWith("\x1B]8;;")) {
        // Track OSC 8 hyperlinks
        activeLink =
          token.value === "\x1B]8;;\x1B\\" || token.value === "\x1B]8;;\x07" ? "" : token.value;
      }
    } else {
      if (col >= width) {
        // Close active link and styles at end of line
        if (activeLink) current += "\x1B]8;;\x1B\\";
        lines.push(current + "\x1B[0m");
        // Reopen link and styles on next line
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

/** Highlight query matches inside an already-ANSI-styled string */
export function highlightAnsi(s: string, query: string): string {
  if (!query) return s;

  // Build visible text and map each visible char to its index in the raw string
  const re = new RegExp(ANSI_RE.source, "g");
  const visibleChars: { char: string; rawIdx: number }[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(s)) !== null) {
    for (let i = last; i < match.index; i++) {
      visibleChars.push({ char: s[i]!, rawIdx: i });
    }
    last = match.index + match[0].length;
  }
  for (let i = last; i < s.length; i++) {
    visibleChars.push({ char: s[i]!, rawIdx: i });
  }

  const visibleText = visibleChars.map((c) => c.char).join("");
  const lowerVisible = visibleText.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // Find all match positions in visible text
  const matches: [number, number][] = [];
  let pos = 0;
  while ((pos = lowerVisible.indexOf(lowerQuery, pos)) >= 0) {
    matches.push([pos, pos + query.length]);
    pos += 1;
  }
  if (matches.length === 0) return s;

  // Build set of raw indices that are inside a match range
  const hlRanges: [number, number][] = [];
  for (const [start, end] of matches) {
    const rawStart = visibleChars[start]!.rawIdx;
    const rawEnd = end < visibleChars.length ? visibleChars[end]!.rawIdx : s.length;
    hlRanges.push([rawStart, rawEnd]);
  }

  const hlOn = `${ESC}7m`;
  const hlOff = `${ESC}27m`;
  const resetSeq = `${ESC}0m`;

  // Rebuild string, re-applying reverse video after any reset within a match
  let result = "";
  let inHighlight = false;
  let rawIdx = 0;

  const escRe = new RegExp(ANSI_RE.source, "g");
  let escMatch: RegExpExecArray | null;

  // Collect all escape sequences with their positions
  const escapes: { idx: number; seq: string }[] = [];
  while ((escMatch = escRe.exec(s)) !== null) {
    escapes.push({ idx: escMatch.index, seq: escMatch[0] });
  }

  let escIdx = 0;
  for (rawIdx = 0; rawIdx <= s.length; rawIdx++) {
    // Check if we enter or leave a highlight range at this position
    const wasIn = inHighlight;
    inHighlight = hlRanges.some(([a, b]) => rawIdx >= a && rawIdx < b);
    if (inHighlight && !wasIn) result += hlOn;
    if (!inHighlight && wasIn) result += hlOff;

    if (rawIdx >= s.length) break;

    // If current position is an escape sequence, append it and handle resets
    if (escIdx < escapes.length && escapes[escIdx]!.idx === rawIdx) {
      const esc = escapes[escIdx]!;
      result += esc.seq;
      // Re-apply reverse video if a reset occurs inside a highlight range
      if (inHighlight && esc.seq === resetSeq) {
        result += hlOn;
      }
      rawIdx += esc.seq.length - 1; // -1 because loop increments
      escIdx++;
    } else {
      result += s[rawIdx];
    }
  }
  return result;
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
