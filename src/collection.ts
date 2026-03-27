import { parseMeta } from "md4x";
import type { Source } from "./sources/_base.ts";
import type { NavEntry } from "./nav.ts";

export type { NavEntry };

export interface ContentMatch {
  line: number;
  text: string;
  context: string[];
}

export interface SearchResult {
  flat: FlatEntry;
  score: number;
  titleMatch: boolean;
  heading?: string;
  contentMatches: ContentMatch[];
}

export interface FlatEntry {
  entry: NavEntry;
  depth: number;
  filePath?: string;
}

export class Collection {
  source: Source;
  tree: NavEntry[] = [];
  flat: FlatEntry[] = [];

  private _fileMap = new Map<string, string>();
  private _contentCache = new Map<string, string>();
  private _changeListeners = new Set<(path: string) => void>();
  private _reloadTimer?: ReturnType<typeof setTimeout>;

  constructor(source: Source) {
    this.source = source;
  }

  async load(): Promise<void> {
    const { tree, fileMap } = await this.source.load();
    this.tree = tree;
    this._fileMap = fileMap;
    this.flat = flattenTree(this.tree, 0, this._fileMap);
    this._contentCache.clear();
  }

  async reload(): Promise<void> {
    return this.load();
  }

  /** Start watching source for changes. Debounces, reloads collection, and notifies listeners. */
  watch(): void {
    this.source.watch(({ path }) => {
      clearTimeout(this._reloadTimer);
      this._reloadTimer = setTimeout(() => {
        this.reload().then(() => {
          for (const listener of this._changeListeners) listener(path);
        });
      }, 100);
    });
  }

  /** Stop watching source. */
  unwatch(): void {
    clearTimeout(this._reloadTimer);
    this.source.unwatch();
    this._changeListeners.clear();
  }

  /** Register a change listener. Returns unsubscribe function. */
  onChange(listener: (path: string) => void): () => void {
    this._changeListeners.add(listener);
    return () => this._changeListeners.delete(listener);
  }

  /** Get raw file content for a flat entry (cached). */
  async getContent(entry: FlatEntry): Promise<string | undefined> {
    if (!entry.filePath || entry.entry.page === false) return undefined;
    const cached = this._contentCache.get(entry.filePath);
    if (cached !== undefined) return cached;
    const raw = await this.source.readContent(entry.filePath);
    this._contentCache.set(entry.filePath, raw);
    return raw;
  }

  /** Invalidate cached content for a specific file path. */
  invalidate(filePath: string): void {
    this._contentCache.delete(filePath);
  }

  /** Fuzzy filter flat entries by query string (title and path only). */
  filter(query: string): FlatEntry[] {
    return fuzzyFilter(this.flat, query, ({ entry }) => [entry.title, entry.path]);
  }

  /** Search flat entries by query string, including page contents. Yields scored results as found. */
  async *search(query: string): AsyncIterable<SearchResult> {
    if (!query) return;
    const lower = query.toLowerCase();
    const terms = lower.split(/\s+/).filter(Boolean);
    const matchAll = (text: string) => terms.every((t) => text.includes(t));
    const seen = new Set<string>();

    for (const flat of this.flat) {
      if (flat.entry.page === false) continue;
      if (seen.has(flat.entry.path)) continue;
      seen.add(flat.entry.path);

      const titleLower = flat.entry.title.toLowerCase();
      const titleMatch = matchAll(titleLower) || matchAll(flat.entry.path.toLowerCase());

      const content = await this.getContent(flat);
      const contentLower = content?.toLowerCase();
      const contentHit = contentLower ? matchAll(contentLower) : false;

      if (!titleMatch && !contentHit) continue;

      // Score: title exact=0, title partial=100, heading exact=150, heading partial=200, content=300
      let score = 300;
      let heading: string | undefined;

      if (titleMatch) {
        score = titleLower === lower ? 0 : 100;
      } else if (content) {
        const meta = parseMeta(content);
        for (const h of meta.headings || []) {
          const hLower = h.text.toLowerCase();
          if (matchAll(hLower)) {
            score = hLower === lower ? 150 : 200;
            heading = h.text;
            break;
          }
        }
      }

      const contentMatches = content ? findMatchLines(content, lower) : [];
      yield { flat, score, titleMatch, heading, contentMatches };
    }
  }

  /** Flat entries that are navigable pages (excludes directory stubs). */
  get pages(): FlatEntry[] {
    return this.flat.filter((f) => f.entry.page !== false);
  }

  /** Find a flat entry by path (exact or with trailing slash). */
  findByPath(path: string): FlatEntry | undefined {
    return this.flat.find(
      (f) => f.entry.page !== false && (f.entry.path === path || f.entry.path === path + "/"),
    );
  }

  /**
   * Resolve a page path to its content, trying:
   * 1. Exact match in the navigation tree
   * 2. Stripped common prefix (e.g., /docs/guide/... → /guide/...)
   * 3. Direct source fetch (for HTTP sources with uncrawled paths)
   */
  async resolvePage(path: string): Promise<{ entry?: FlatEntry; raw?: string }> {
    const normalized = path.startsWith("/") ? path : "/" + path;

    // Try exact match first
    const entry = this.findByPath(normalized);
    if (entry) {
      const raw = await this.getContent(entry);
      if (raw) return { entry, raw };
    }

    // Try stripping common prefixes (e.g. /docs/guide/... → /guide/...)
    const prefixed = normalized.match(/^\/[^/]+(\/.+)$/);
    if (prefixed) {
      const stripped = this.findByPath(prefixed[1]!);
      if (stripped) {
        const raw = await this.getContent(stripped);
        if (raw) return { entry: stripped, raw };
      }
    }

    // Fallback: fetch directly from source (works for HTTP sources with uncrawled paths)
    const raw = await this.source.readContent(normalized).catch(() => undefined);
    if (raw) return { raw };

    return {};
  }

  /** Suggest related pages for a query (fuzzy + keyword fallback). */
  suggest(query: string, max = 5): FlatEntry[] {
    // Try fuzzy match on full query
    let results = this.filter(query);
    if (results.length > 0) return results.slice(0, max);

    // Try last path segment
    const segments = query.replace(/^\/+/, "").split("/").filter(Boolean);
    const lastSegment = segments.at(-1);
    if (lastSegment && lastSegment !== query) {
      results = this.filter(lastSegment);
      if (results.length > 0) return results.slice(0, max);
    }

    // Try individual keywords from path segments
    const keywords = segments.flatMap((s) => s.split("-")).filter(Boolean);
    return this.pages
      .filter((f) =>
        keywords.some(
          (kw) =>
            f.entry.title.toLowerCase().includes(kw) || f.entry.path.toLowerCase().includes(kw),
        ),
      )
      .slice(0, max);
  }
}

function flattenTree(
  entries: NavEntry[],
  depth: number,
  fileMap: Map<string, string>,
): FlatEntry[] {
  const result: FlatEntry[] = [];
  for (const entry of entries) {
    result.push({
      entry,
      depth,
      filePath: fileMap.get(entry.path),
    });
    if (entry.children) {
      result.push(...flattenTree(entry.children, depth + 1, fileMap));
    }
  }
  return result;
}

/**
 * Fuzzy match: checks if all characters of `query` appear in `target` in order.
 * Returns a score (lower is better) or -1 if no match.
 */
function fuzzyMatch(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (q.length === 0) return 0;
  if (q.length > t.length) return -1;

  let score = 0;
  let qi = 0;
  let prevMatchIdx = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (prevMatchIdx === ti - 1) score -= 5;
      if (ti === 0 || "/\\-_. ".includes(t[ti - 1]!)) score -= 10;
      if (prevMatchIdx >= 0) score += ti - prevMatchIdx - 1;
      prevMatchIdx = ti;
      qi++;
    }
  }

  if (qi < q.length) return -1;
  score += t.length * 0.1;
  return score;
}

/**
 * Fuzzy filter + sort a list of items.
 * Returns items that match, sorted by best score (lowest first).
 */
function fuzzyFilter<T>(items: T[], query: string, getText: (item: T) => string[]): T[] {
  if (!query) return items;

  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    let best = Infinity;
    for (const text of getText(item)) {
      const s = fuzzyMatch(query, text);
      if (s !== -1 && s < best) best = s;
    }
    if (best < Infinity) {
      scored.push({ item, score: best });
    }
  }

  scored.sort((a, b) => a.score - b.score);
  return scored.map((s) => s.item);
}

function findMatchLines(content: string, lowerQuery: string, contextLines = 1): ContentMatch[] {
  const matches: ContentMatch[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.toLowerCase().includes(lowerQuery)) {
      const context: string[] = [];
      for (
        let j = Math.max(0, i - contextLines);
        j <= Math.min(lines.length - 1, i + contextLines);
        j++
      ) {
        if (j !== i) context.push(lines[j]!.trim());
      }
      matches.push({ line: i + 1, text: lines[i]!.trim(), context });
    }
  }
  return matches;
}
