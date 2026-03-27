import { readFile, readdir, stat } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { parseMeta } from "md4x";

export interface NavEntry {
  /** URL-friendly path segment (without numeric prefix) */
  slug: string;
  /** Full resolved URL path from docs root */
  path: string;
  /** Display title (from frontmatter → first heading → humanized slug) */
  title: string;
  /** Original numeric prefix used for ordering */
  order: number;
  /** Icon from frontmatter, navigation override, or .navigation.yml */
  icon?: string;
  /** Description from frontmatter or navigation override */
  description?: string;
  /** `false` when directory has no index page (non-clickable group) */
  page?: false;
  /** Nested children (for directories) */
  children?: NavEntry[];
  /** Arbitrary extra frontmatter/meta fields */
  [key: string]: unknown;
}

export interface ScanNavOptions {
  /** Include draft files (default: false) */
  drafts?: boolean;
}

/**
 * Parse a numbered filename/dirname like "1.guide" or "3.middleware.md"
 * into { order, slug }. Also strips `.draft` suffix.
 */
export function parseNumberedName(name: string): {
  order: number;
  slug: string;
  draft: boolean;
} {
  let base = name.endsWith(".md") ? name.slice(0, -3) : name;
  const draft = base.endsWith(".draft");
  if (draft) {
    base = base.slice(0, -6);
  }
  const match = base.match(/^(\d+)\.(.+)$/);
  if (match) {
    return { order: Number(match[1]), slug: match[2]!, draft };
  }
  return { order: Infinity, slug: base, draft };
}

/**
 * Convert a slug like "getting-started" to "Getting Started".
 */
export function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Read and parse a .navigation.yml file as simple key: value pairs.
 */
async function readNavigation(dirPath: string): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(join(dirPath, ".navigation.yml"), "utf8");
    const { headings: _headings, ...rest } = parseMeta(`---\n${content}\n---\n`);
    return rest as Record<string, unknown>;
  } catch {
    return {};
  }
}

const _knownKeys = new Set([
  "slug",
  "path",
  "title",
  "order",
  "icon",
  "description",
  "page",
  "children",
  "headings",
]);

/**
 * Extract navigation overrides from frontmatter `navigation` field.
 * Returns merged meta with navigation fields taking priority.
 */
function applyNavigationOverride(meta: Record<string, unknown>): Record<string, unknown> {
  const nav = meta.navigation;
  if (nav === false) return { ...meta, navigation: false };
  if (typeof nav === "object" && nav !== null) {
    const { navigation: _nav, ...rest } = meta;
    return { ...rest, ...(nav as Record<string, unknown>) };
  }
  return meta;
}

/**
 * Extract extra meta fields (non-known keys) from a record.
 */
function extraMeta(record: Record<string, unknown>): Record<string, unknown> | undefined {
  const extra: Record<string, unknown> = {};
  let hasExtra = false;
  for (const [key, value] of Object.entries(record)) {
    if (!_knownKeys.has(key) && key !== "navigation") {
      extra[key] = value;
      hasExtra = true;
    }
  }
  return hasExtra ? extra : undefined;
}

/**
 * Scan a docs directory and build a navigation tree
 * using md4x parseMeta for extracting markdown metadata.
 */
export async function scanNav(dirPath: string, options?: ScanNavOptions): Promise<NavEntry[]> {
  return _scanNav(dirPath, "/", options || {});
}

async function _scanNav(
  dirPath: string,
  parentPath: string,
  options: ScanNavOptions,
): Promise<NavEntry[]> {
  const dirEntries = await readdir(dirPath);
  const entries: NavEntry[] = [];

  for (const entry of dirEntries) {
    // Skip hidden/config files, partials, and common non-doc dirs
    if (
      entry.startsWith(".") ||
      entry.startsWith("_") ||
      entry === "node_modules" ||
      entry === "dist" ||
      entry === "package.json" ||
      entry === "pnpm-lock.yaml" ||
      entry === "pnpm-workspace.yaml"
    ) {
      continue;
    }

    const fullPath = join(dirPath, entry);
    let stats;
    try {
      stats = await stat(fullPath);
    } catch {
      continue;
    }

    if (stats.isDirectory()) {
      const { order, slug } = parseNumberedName(entry);
      const nav = await readNavigation(fullPath);

      // Skip if navigation: false
      if (nav.navigation === false) continue;

      const children = await _scanNav(
        fullPath,
        parentPath === "/" ? `/${slug}` : `${parentPath}/${slug}`,
        options,
      );

      // Check if directory has an index page among children
      const hasIndex = children.some((c) => c.slug === "");

      const navEntry: NavEntry = {
        slug,
        path: parentPath === "/" ? `/${slug}` : `${parentPath}/${slug}`,
        title: (nav.title as string) || humanizeSlug(slug),
        order,
        ...(nav.icon ? { icon: nav.icon as string } : {}),
        ...(nav.description ? { description: nav.description as string } : {}),
        ...(!hasIndex ? { page: false as const } : {}),
        ...(children.length > 0 ? { children } : {}),
      };

      entries.push(navEntry);
    } else if (extname(entry) === ".md") {
      const { order, slug, draft } = parseNumberedName(basename(entry));

      // Skip drafts unless enabled
      if (draft && !options.drafts) continue;

      const content = await readFile(fullPath, "utf8");
      const rawMeta = parseMeta(content) as Record<string, unknown>;
      const meta = applyNavigationOverride(rawMeta);

      // Skip if navigation: false
      if (meta.navigation === false) continue;

      const resolvedOrder = typeof meta.order === "number" ? meta.order : order;
      const resolvedSlug = slug === "index" ? "" : slug;
      const firstHeading = (
        rawMeta.headings as { text: string; level: number }[] | undefined
      )?.find((h) => h.level === 1)?.text;
      const title = (meta.title as string) || firstHeading || humanizeSlug(slug) || "index";

      const entryPath =
        resolvedSlug === ""
          ? parentPath === "/"
            ? "/"
            : parentPath
          : parentPath === "/"
            ? `/${resolvedSlug}`
            : `${parentPath}/${resolvedSlug}`;

      const extra = extraMeta(meta);

      const navEntry: NavEntry = {
        slug: resolvedSlug,
        path: entryPath,
        title,
        order: resolvedOrder,
        ...(firstHeading && firstHeading !== title ? { heading: firstHeading } : {}),
        ...(meta.icon ? { icon: meta.icon as string } : {}),
        ...(meta.description ? { description: meta.description as string } : {}),
        ...(draft ? { draft: true } : {}),
        ...extra,
      };

      entries.push(navEntry);
    }
  }

  entries.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));

  return entries;
}
