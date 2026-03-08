import { parseMeta } from "md4x";
import { DocsSource } from "./_base.ts";
import type { NavEntry } from "../nav.ts";

export interface DocsSourceHTTPOptions {
  /** Additional headers to send with each request */
  headers?: Record<string, string>;
}

export class DocsSourceHTTP extends DocsSource {
  url: string;
  options: DocsSourceHTTPOptions;

  private _contentCache = new Map<string, string>();
  private _tree: NavEntry[] = [];
  private _fileMap = new Map<string, string>();
  private _npmPackage?: string;

  constructor(url: string, options: DocsSourceHTTPOptions = {}) {
    super();
    this.url = url.replace(/\/+$/, "");
    this._npmPackage = _parseNpmURL(this.url);
    this.options = options;
  }

  async load(): Promise<{
    tree: NavEntry[];
    fileMap: Map<string, string>;
  }> {
    // npm package: fetch README from registry
    if (this._npmPackage) {
      return this._loadNpm(this._npmPackage);
    }

    // Try llms.txt first for a structured table of contents
    const llmsTree = await this._tryLlmsTxt();
    if (llmsTree) {
      this._tree = llmsTree;
      return { tree: this._tree, fileMap: this._fileMap };
    }

    // Fallback: fetch homepage and extract links
    const markdown = await this._fetch(this.url);
    this._contentCache.set("/", markdown);

    const meta = parseMeta(markdown);
    const title = (meta.title as string) || _titleFromURL(this.url);

    const rootEntry: NavEntry = {
      slug: "",
      path: "/",
      title,
      order: 0,
    };

    // Extract internal links to build child entries
    const { entries: children, tocPaths } = _extractLinks(markdown, this.url);
    if (children.length > 0) {
      rootEntry.children = children;
      for (const child of children) {
        this._fileMap.set(child.path, child.path);
      }
    }

    this._tree = [rootEntry];
    this._fileMap.set("/", "/");

    // Crawl index.md pages for sub-navigation
    if (tocPaths.size > 0) {
      await this._crawlTocPages(children, tocPaths);
    }

    return { tree: this._tree, fileMap: this._fileMap };
  }

  /** Try fetching /llms.txt and parse it into a nav tree */
  private async _tryLlmsTxt(): Promise<NavEntry[] | undefined> {
    let origin: string;
    try {
      origin = new URL(this.url).origin;
    } catch {
      return undefined;
    }

    let text: string;
    try {
      const res = await fetch(`${origin}/llms.txt`, {
        headers: { accept: "text/plain", ...this.options.headers },
      });
      if (!res.ok) return undefined;
      text = await res.text();
    } catch {
      return undefined;
    }

    // Must look like llms.txt (starts with # title)
    if (!text.trimStart().startsWith("#")) return undefined;

    return _parseLlmsTxt(text, origin, this._fileMap, this._contentCache);
  }

  async readContent(filePath: string): Promise<string> {
    const cached = this._contentCache.get(filePath);
    if (cached !== undefined) return cached;

    const origin = new URL(this.url).origin;
    const url = filePath === "/" ? this.url : `${origin}${filePath}`;
    const markdown = await this._fetch(url);
    this._contentCache.set(filePath, markdown);
    return markdown;
  }

  /** Crawl index.md pages and attach their links as children */
  private async _crawlTocPages(
    entries: NavEntry[],
    tocPaths: Set<string>,
    depth = 0,
  ): Promise<void> {
    if (depth > 3) return;
    const origin = new URL(this.url).origin;
    await Promise.all(
      entries.map(async (entry) => {
        if (!tocPaths.has(entry.path)) return;
        const url = `${origin}${entry.path}`;
        const markdown = await this._fetch(url);
        this._contentCache.set(entry.path, markdown);
        const { entries: children, tocPaths: subTocPaths } = _extractLinks(markdown, url);
        if (children.length > 0) {
          entry.children = children;
          for (const child of children) {
            this._fileMap.set(child.path, child.path);
          }
          if (subTocPaths.size > 0) {
            await this._crawlTocPages(children, subTocPaths, depth + 1);
          }
        }
      }),
    );
  }

  /** Load an npm package README from the registry */
  private async _loadNpm(pkg: string): Promise<{ tree: NavEntry[]; fileMap: Map<string, string> }> {
    const registryURL = `https://registry.npmjs.org/${pkg}`;
    let markdown: string;
    try {
      const res = await fetch(registryURL, {
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        markdown = `# ${res.status} ${res.statusText}\n\nFailed to fetch package \`${pkg}\` from npm registry`;
      } else {
        const data = (await res.json()) as { readme?: string; name?: string; description?: string };
        markdown =
          data.readme || `# ${data.name || pkg}\n\n${data.description || "No README available."}`;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      markdown = `# Fetch Error\n\nFailed to fetch package \`${pkg}\`\n\n> ${message}`;
    }

    this._contentCache.set("/", markdown);
    this._fileMap.set("/", "/");

    const meta = parseMeta(markdown);
    const title = (meta.title as string) || pkg;

    this._tree = [
      {
        slug: "",
        path: "/",
        title,
        order: 0,
      },
    ];

    return { tree: this._tree, fileMap: this._fileMap };
  }

  private async _fetch(url: string): Promise<string> {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          accept: "text/markdown, text/plain;q=0.9, text/html;q=0.8",
          ...this.options.headers,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `# Fetch Error\n\nFailed to fetch \`${url}\`\n\n> ${message}`;
    }

    if (!res.ok) {
      return `# ${res.status} ${res.statusText}\n\nFailed to fetch \`${url}\``;
    }

    const contentType = res.headers.get("content-type") || "";
    const text = await res.text();

    if (_isHTML(contentType, text)) {
      const { htmlToMarkdown } = await import("mdream");
      return htmlToMarkdown(text, { origin: url });
    }

    return text;
  }
}

/** Check if a response is HTML by content-type or content sniffing */
function _isHTML(contentType: string, body: string): boolean {
  if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
    return true;
  }
  const trimmed = body.trimStart();
  return trimmed.startsWith("<!") || trimmed.startsWith("<html");
}

/** Extract a readable title from a URL */
function _titleFromURL(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Parse llms.txt content into a nav tree.
 * Format: `# Title`, `> Description`, `## Section`, `- [Title](url): description`
 */
function _parseLlmsTxt(
  text: string,
  origin: string,
  fileMap: Map<string, string>,
  contentCache: Map<string, string>,
): NavEntry[] {
  const lines = text.split("\n");
  const tree: NavEntry[] = [];
  let siteTitle = "";
  let siteDescription = "";
  let currentSection: NavEntry | undefined;
  let order = 0;
  let childOrder = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // # Site Title
    if (!siteTitle && trimmed.startsWith("# ") && !trimmed.startsWith("## ")) {
      siteTitle = trimmed.slice(2).trim();
      continue;
    }

    // > Description
    if (!siteDescription && trimmed.startsWith("> ")) {
      siteDescription = trimmed.slice(2).trim();
      continue;
    }

    // ## Section heading
    if (trimmed.startsWith("## ")) {
      currentSection = {
        slug: _slugify(trimmed.slice(3).trim()),
        path: `/_section/${order}`,
        title: trimmed.slice(3).trim(),
        order: order++,
        page: false,
        children: [],
      };
      childOrder = 0;
      tree.push(currentSection);
      continue;
    }

    // - [Title](url): description
    const linkMatch = trimmed.match(/^-\s*\[([^\]]+)]\(([^)]+)\)(?::\s*(.+))?$/);
    if (linkMatch) {
      const title = linkMatch[1]!;
      const href = linkMatch[2]!;
      const description = linkMatch[3]?.trim();

      let resolved: URL;
      try {
        resolved = new URL(href, origin);
        if (resolved.origin !== origin) continue;
      } catch {
        continue;
      }

      const path = resolved.pathname.replace(/\/+$/, "") || "/";
      const slug = path.split("/").pop() || path;

      const entry: NavEntry = {
        slug,
        path,
        title,
        order: childOrder++,
        ...(description ? { description } : {}),
      };

      fileMap.set(path, path);

      if (currentSection) {
        currentSection.children!.push(entry);
      } else {
        tree.push(entry);
      }
      continue;
    }
  }

  if (tree.length === 0) return [];

  // Wrap everything under a root entry with the site title
  const root: NavEntry = {
    slug: "",
    path: "/",
    title: siteTitle || _titleFromURL(origin),
    order: 0,
    ...(siteDescription ? { description: siteDescription } : {}),
    ...(tree.length > 0 ? { children: tree } : {}),
  };

  fileMap.set("/", "/");
  contentCache.set("/", text);

  return [root];
}

function _slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z\d]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Extract internal links from markdown content to build nav children */
function _extractLinks(
  markdown: string,
  baseURL: string,
): { entries: NavEntry[]; tocPaths: Set<string> } {
  const seen = new Set<string>();
  const entries: NavEntry[] = [];
  const tocPaths = new Set<string>();
  let order = 0;

  // Match markdown links: [text](url)
  const linkRe = /\[([^\]]+)]\(([^)]+)\)/g;
  let match;
  while ((match = linkRe.exec(markdown)) !== null) {
    const title = match[1]!;
    const href = match[2]!;

    const resolved = _resolveHref(href, baseURL);
    if (!resolved) continue;

    // Normalize path: strip .md extension and index suffixes
    let path = resolved.pathname.replace(/\/+$/, "") || "/";
    const isToc = /\/index\.md$/i.test(path) || path.endsWith("/index");
    path = path
      .replace(/\/index\.md$/i, "")
      .replace(/\/index$/, "")
      .replace(/\.md$/i, "");
    path = path || "/";

    if (path === "/") continue; // skip self-referencing root link
    if (seen.has(path)) continue;
    seen.add(path);

    if (isToc) tocPaths.add(path);

    const slug = path.split("/").pop() || path;

    entries.push({
      slug,
      path,
      title,
      order: order++,
    });
  }

  return { entries, tocPaths };
}

/**
 * Detect npmjs.com URLs and extract the package name.
 * Supports: npmjs.com/<pkg>, npmjs.com/package/<pkg>, www.npmjs.com/package/<pkg>
 * Also handles scoped packages: npmjs.com/package/@scope/name
 */
function _parseNpmURL(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.hostname !== "www.npmjs.com" && parsed.hostname !== "npmjs.com") {
    return undefined;
  }
  // /package/@scope/name or /package/name
  const pkgMatch = parsed.pathname.match(/^\/package\/((?:@[^/]+\/)?[^/]+)\/?$/);
  if (pkgMatch) return pkgMatch[1];
  // Short form: npmjs.com/<name> (not a known route like /settings, /signup, etc.)
  const shortMatch = parsed.pathname.match(/^\/((?:@[^/]+\/)?[^/]+)\/?$/);
  if (shortMatch && !/^(package|settings|signup|login|org|search)$/.test(shortMatch[1]!)) {
    return shortMatch[1];
  }
  return undefined;
}

/** Resolve an href relative to a base URL, returning null for external links */
function _resolveHref(href: string, baseURL: string): URL | undefined {
  try {
    const base = new URL(baseURL);
    const resolved = new URL(href, baseURL);
    // Only keep same-origin links
    if (resolved.origin !== base.origin) return undefined;
    // Skip anchors, query-only, and non-page resources
    if (href.startsWith("#")) return undefined;
    if (/\.(png|jpg|jpeg|gif|svg|css|js|ico|woff2?)$/i.test(resolved.pathname)) return undefined;
    return resolved;
  } catch {
    return undefined;
  }
}
