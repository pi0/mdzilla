import { type Collection, type Source } from "mdzilla";

let _docs: Collection;

export async function useDocs(initOpts?: { source: Source }): Promise<Collection> {
  if (_docs) return _docs;
  if (!_docs) {
    const { Collection, resolveSource } = await import("mdzilla");
    _docs = new Collection(
      initOpts?.source || resolveSource(process.env.DOCS_SOURCE || "gh:nitrojs/nitro/docs"),
    );
    await _docs.load();
    _docs.watch();
  }
  return _docs;
}
