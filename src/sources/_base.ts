import type { NavEntry } from "../nav.ts";

export abstract class Source {
  abstract load(): Promise<{
    tree: NavEntry[];
    fileMap: Map<string, string>;
  }>;

  abstract readContent(filePath: string): Promise<string>;
}
