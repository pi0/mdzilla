/** Extract short text snippets around matching terms. */
export function extractSnippets(
  content: string,
  terms: string[],
  opts: { maxSnippets?: number; radius?: number } = {},
): string[] {
  const { maxSnippets = 3, radius = 80 } = opts;
  const lower = content.toLowerCase();
  const positions: number[] = [];

  for (const term of terms) {
    let idx = lower.indexOf(term);
    while (idx !== -1 && positions.length < maxSnippets * 2) {
      positions.push(idx);
      idx = lower.indexOf(term, idx + term.length);
    }
  }

  positions.sort((a, b) => a - b);

  const snippets: string[] = [];
  let prevEnd = -1;
  for (const pos of positions) {
    if (snippets.length >= maxSnippets) break;
    const start = Math.max(0, pos - radius);
    const end = Math.min(content.length, pos + radius);
    if (start <= prevEnd) continue;
    prevEnd = end;
    let snippet = content.slice(start, end).trim().replaceAll(/\s+/g, " ");
    if (start > 0) snippet = "…" + snippet;
    if (end < content.length) snippet = snippet + "…";
    snippets.push(snippet);
  }

  return snippets;
}
