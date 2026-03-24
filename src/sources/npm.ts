import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Source } from "./_base.ts";
import { SourceFS } from "./fs.ts";
import { parseNpmSpec, fetchNpmInfo } from "./_npm.ts";
import type { NavEntry } from "../nav.ts";

export interface SourceNpmOptions {
  /** Subdirectory within the package containing docs */
  subdir?: string;
}

export class SourceNpm extends Source {
  src: string;
  options: SourceNpmOptions;

  private _fs?: SourceFS;

  constructor(src: string, options: SourceNpmOptions = {}) {
    super();
    this.src = src;
    this.options = options;
  }

  async load(): Promise<{
    tree: NavEntry[];
    fileMap: Map<string, string>;
  }> {
    // Ensure npm: prefix for giget provider routing
    const pkg = this.src.startsWith("npm:") ? this.src : `npm:${this.src}`;
    const source = this.options.subdir ? `${pkg}/${this.options.subdir}` : pkg;

    const id = source.replace(/[/#:@]/g, "_");
    const dir = join(tmpdir(), "mdzilla", "npm", id);

    const { downloadTemplate } = await import("giget");
    await downloadTemplate(source, {
      dir,
      force: true,
      install: false,
      providers: { npm: npmProvider },
      registry: false,
    });

    let docsDir = dir;
    for (const sub of ["docs/content", "docs"]) {
      const candidate = join(dir, sub);
      if (existsSync(candidate)) {
        docsDir = candidate;
        break;
      }
    }

    this._fs = new SourceFS(docsDir);
    return this._fs.load();
  }

  async readContent(filePath: string): Promise<string> {
    if (!this._fs) {
      throw new Error("SourceNpm: call load() before readContent()");
    }
    return this._fs.readContent(filePath);
  }
}

// Custom giget provider that resolves npm packages via the registry
async function npmProvider(input: string) {
  const { name, version, subdir } = parseNpmSpec(input);
  const info = await fetchNpmInfo(name, version);
  return {
    name: info.name as string,
    version: info.version as string,
    subdir,
    tar: (info.dist as { tarball: string }).tarball,
  };
}
