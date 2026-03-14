import { readFile } from "node:fs/promises";
import { scanNav } from "../nav.ts";
import { readdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { DocsSource } from "./_base.ts";
import type { NavEntry } from "../nav.ts";

export class DocsSourceFS extends DocsSource {
  dir: string;

  constructor(dir: string) {
    super();
    this.dir = dir;
  }

  async load(): Promise<{
    tree: NavEntry[];
    fileMap: Map<string, string>;
  }> {
    const tree = await scanNav(this.dir);
    await applyNavManifest(tree, this.dir);
    const fileMap = await buildFileMap("/", this.dir);
    return { tree, fileMap };
  }

  async readContent(filePath: string): Promise<string> {
    return readFile(filePath, "utf8");
  }
}

function parseSlug(name: string): string {
  const base = name.endsWith(".draft") ? name.slice(0, -6) : name;
  const match = base.match(/^(\d+)\.(.+)$/);
  return match ? match[2]! : base;
}

async function buildFileMap(parentPath: string, dirPath: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (
      entry.name.startsWith(".") ||
      entry.name.startsWith("_") ||
      entry.name === "node_modules" ||
      entry.name === "dist"
    )
      continue;

    const fullPath = join(dirPath, entry.name);

    if (entry.isDirectory()) {
      const slug = parseSlug(entry.name);
      const navPath = parentPath === "/" ? `/${slug}` : `${parentPath}/${slug}`;
      const childMap = await buildFileMap(navPath, fullPath);
      for (const [k, v] of childMap) map.set(k, v);
    } else if (extname(entry.name) === ".md") {
      const slug = parseSlug(entry.name.replace(/\.md$/, ""));
      const resolvedSlug = slug === "index" ? "" : slug;
      const entryPath =
        resolvedSlug === ""
          ? parentPath === "/"
            ? "/"
            : parentPath
          : parentPath === "/"
            ? `/${resolvedSlug}`
            : `${parentPath}/${resolvedSlug}`;
      map.set(entryPath, fullPath);
    }
  }
  return map;
}

/**
 * Read `_navigation.json` manifest (exported by mdzilla) and apply its
 * ordering to the scanned nav tree. Only reorders; does not add/remove entries.
 */
async function applyNavManifest(tree: NavEntry[], dir: string): Promise<void> {
  let manifest: NavEntry[];
  try {
    manifest = JSON.parse(await readFile(join(dir, "_navigation.json"), "utf8"));
  } catch {
    return;
  }
  reorderTree(tree, manifest);
}

/** Recursively reorder tree entries to match manifest ordering. */
function reorderTree(entries: NavEntry[], manifest: NavEntry[]): void {
  const pathIndex = new Map(manifest.map((m, i) => [m.path, i]));
  entries.sort((a, b) => {
    const ai = pathIndex.get(a.path) ?? Infinity;
    const bi = pathIndex.get(b.path) ?? Infinity;
    return ai - bi;
  });

  for (const entry of entries) {
    if (entry.children?.length) {
      const manifestEntry = manifest.find((m) => m.path === entry.path);
      if (manifestEntry?.children) {
        reorderTree(entry.children, manifestEntry.children);
      }
    }
  }
}
