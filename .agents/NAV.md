# Nav Scanner — Expected Behavior

## Interface

```ts
interface NavEntry {
  /** URL-friendly path segment (without numeric prefix) */
  slug: string;
  /** Full resolved URL path from root (e.g., "/guide/installation") */
  path: string;
  /** Display title (from frontmatter → first heading → humanized slug) */
  title: string;
  /** Original numeric prefix used for ordering (Infinity if unnumbered) */
  order: number;
  /** Icon from frontmatter, navigation override, or .navigation.yml */
  icon?: string;
  /** Description from frontmatter or navigation override */
  description?: string;
  /** false when directory has no index page (non-clickable group) */
  page?: false;
  /** Nested children (for directories) */
  children?: NavEntry[];
  /** Arbitrary extra frontmatter/meta fields */
  [key: string]: unknown;
}
```

## File System Conventions

### Ordering

- Numeric prefix determines order: `1.guide/`, `2.utils/`, `0.index.md`
- Prefix is stripped from slug: `1.guide` → slug `"guide"`
- Unnumbered items get `order: Infinity`, sorted alphabetically after numbered ones
- Frontmatter `order` (or `navigation.order`) overrides the filename-derived order

### Index Files

- `index.md` or `0.index.md` in a directory → slug becomes `""`
- Serves as the directory's own page (makes the directory clickable)
- A directory without an index file gets `page: false`

### Hidden / Skipped Entries

- Dotfiles/dotdirs (`.config/`, `.partials/`)
- `package.json`, lockfiles
- Files with frontmatter `navigation: false`
- Directories with `.navigation.yml` containing `navigation: false`

### Draft Files

- Files ending in `.draft.md` (e.g., `3.feature.draft.md`)
- `.draft` suffix is stripped from slug
- Included in dev, excluded in production (controlled by options)

### Partial Files

- Files/dirs prefixed with `_` (e.g., `_partials/`, `_components.md`)
- Excluded from navigation entirely

## Metadata Resolution

### Title

Priority order:

1. Frontmatter `title`
2. First `# heading` from `parseMeta`
3. Humanized slug (`getting-started` → `Getting Started`)

### Navigation Override

Frontmatter can include a `navigation` field:

```yaml
---
title: Full Page Title
navigation:
  title: Short Nav Title
  icon: i-lucide-book
---
```

Fields in `navigation` override the corresponding top-level fields **only for the nav tree**.

### `.navigation.yml`

Per-directory config in `.navigation.yml`:

```yaml
title: Getting Started
icon: i-lucide-square-play
```

Applied to the directory's own NavEntry. Fields from `.navigation.yml` can be overridden by an index file's frontmatter.

### Meta Passthrough

All frontmatter fields (beyond the known ones) are passed through to NavEntry as arbitrary `[key: string]: unknown` properties.

## Path Construction

The `path` field is the full URL path from the docs root:

- `docs/1.guide/2.installation.md` → path `"/guide/installation"`
- `docs/1.guide/0.index.md` → path `"/guide"`
- `docs/0.index.md` → path `"/"`
- Numeric prefixes stripped, `.md` stripped, `index` stripped
- All segments lowercased and slugified

## Sorting

Within each directory level:

1. Sort by `order` ascending (numeric prefix)
2. Ties broken alphabetically by `slug`

## Function Signature

```ts
interface ScanNavOptions {
  /** Include draft files (default: false) */
  drafts?: boolean;
}

function scanNav(dirPath: string, options?: ScanNavOptions): Promise<NavEntry[]>;
```
