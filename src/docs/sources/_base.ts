import type { NavEntry } from "../nav.ts";

export abstract class DocsSource {
  abstract load(): Promise<{
    tree: NavEntry[];
    fileMap: Map<string, string>;
  }>;

  abstract readContent(filePath: string): Promise<string>;
}
