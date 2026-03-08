import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { renderToText } from "md4x";
import type { DocsManager } from "./manager.ts";

export interface ExportOptions {
  /** Include entries where page === false (directory stubs). Default: false */
  includeStubs?: boolean;
  /** Compile markdown to plain text using md4x. Default: false */
  plainText?: boolean;
}

export abstract class DocsExporter {
  abstract export(manager: DocsManager, options?: ExportOptions): Promise<void>;
}

export class DocsExporterFS extends DocsExporter {
  dir: string;

  constructor(dir: string) {
    super();
    this.dir = dir;
  }

  async export(manager: DocsManager, options: ExportOptions = {}): Promise<void> {
    for (const flat of manager.flat) {
      if (!options.includeStubs && flat.entry.page === false) continue;

      let content = await manager.getContent(flat);
      if (content === undefined) continue;

      if (options.plainText) {
        content = renderToText(content);
      }

      const filePath = flat.entry.path === "/" ? "/index.md" : `${flat.entry.path}.md`;
      const dest = join(this.dir, filePath);

      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, content, "utf8");
    }
  }
}
