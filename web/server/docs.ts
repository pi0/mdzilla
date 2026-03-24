import type { Collection, Source } from "mdzilla";

let _docs: Collection;

export async function useDocs(initOpts?: { source: Source }): Promise<Collection> {
  if (_docs) return _docs;
  if (!_docs) {
    const { Collection, GitSource } = await import("mdzilla");
    _docs = new Collection(
      initOpts?.source || new GitSource("gh:nitrojs/nitro/docs", { subdir: "docs" }),
    );
    await _docs.load();
  }
  return _docs;
}
