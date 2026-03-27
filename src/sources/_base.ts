import type { NavEntry } from "../nav.ts";

export type WatchCallback = (event: { path: string }) => void;

export abstract class Source {
  abstract load(): Promise<{
    tree: NavEntry[];
    fileMap: Map<string, string>;
  }>;

  abstract readContent(filePath: string): Promise<string>;

  /** Start watching for file changes. Override in sources that support it. */
  watch(_callback: WatchCallback): void {}

  /** Stop watching. Override in sources that support it. */
  unwatch(): void {}
}
