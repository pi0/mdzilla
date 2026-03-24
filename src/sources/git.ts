import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Source } from "./_base.ts";
import { FSSource } from "./fs.ts";
import type { NavEntry } from "../nav.ts";

export interface GitSourceOptions {
  /** Authorization token for private repos */
  auth?: string;
  /** Subdirectory within the repo containing docs */
  subdir?: string;
}

export class GitSource extends Source {
  src: string;
  options: GitSourceOptions;

  private _fs?: FSSource;

  constructor(src: string, options: GitSourceOptions = {}) {
    super();
    this.src = src;
    this.options = options;
  }

  async load(): Promise<{
    tree: NavEntry[];
    fileMap: Map<string, string>;
  }> {
    const source = this.options.subdir ? `${this.src}/${this.options.subdir}` : this.src;

    const id = source.replace(/[/#:]/g, "_");
    const dir = join(tmpdir(), "mdzilla", "gh", id);

    const { downloadTemplate } = await import("giget");
    await downloadTemplate(source, {
      dir,
      auth: this.options.auth,
      force: true,
      install: false,
    });

    let docsDir = dir;
    for (const sub of ["docs/content", "docs"]) {
      const candidate = join(dir, sub);
      if (existsSync(candidate)) {
        docsDir = candidate;
        break;
      }
    }

    this._fs = new FSSource(docsDir);
    return this._fs.load();
  }

  async readContent(filePath: string): Promise<string> {
    if (!this._fs) {
      throw new Error("GitSource: call load() before readContent()");
    }
    return this._fs.readContent(filePath);
  }
}
