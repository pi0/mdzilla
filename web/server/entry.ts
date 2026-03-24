// @ts-ignore
import "#nitro/virtual/polyfills";
import type { Source } from "mdzilla";
import { useNitroApp } from "nitro/app";
import { useDocs } from "./docs.ts";

export async function createDocsServer(initOpts: { source: Source }) {
  const nitroApp = useNitroApp();
  const docs = await useDocs(initOpts);
  return {
    fetch: nitroApp.fetch,
    docs,
  };
}
