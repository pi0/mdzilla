import type { Source } from "./sources/_base.ts";
import type { NavEntry } from "./nav.ts";

export type { NavEntry };

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

  /** Fuzzy filter flat entries by query string. */
  filter(query: string): FlatEntry[] {
    return fuzzyFilter(this.flat, query, ({ entry }) => [entry.title, entry.path]);
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

  /** Return indices of matching flat entries (case-insensitive substring). */
  matchIndices(query: string): number[] {
    if (!query) return [];
    const lower = query.toLowerCase();
    const matched = new Set<number>();
    for (let i = 0; i < this.flat.length; i++) {
      const { entry } = this.flat[i]!;
      if (entry.title.toLowerCase().includes(lower) || entry.path.toLowerCase().includes(lower)) {
        matched.add(i);
        const parentDepth = this.flat[i]!.depth;
        for (let j = i + 1; j < this.flat.length; j++) {
          if (this.flat[j]!.depth <= parentDepth) break;
          matched.add(j);
        }
      }
    }
    return [...matched].sort((a, b) => a - b);
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
      if (s >= 0 && s < best) best = s;
    }
    if (best < Infinity) {
      scored.push({ item, score: best });
    }
  }

  scored.sort((a, b) => a.score - b.score);
  return scored.map((s) => s.item);
}
