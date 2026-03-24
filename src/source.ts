import { FSSource } from "./sources/fs.ts";
import { GitSource } from "./sources/git.ts";
import { HTTPSource } from "./sources/http.ts";
import { NpmSource } from "./sources/npm.ts";
import type { Source } from "./sources/_base.ts";

export { Source } from "./sources/_base.ts";
export { FSSource } from "./sources/fs.ts";
export { GitSource } from "./sources/git.ts";
export type { GitSourceOptions } from "./sources/git.ts";
export { HTTPSource } from "./sources/http.ts";
export type { HTTPSourceOptions } from "./sources/http.ts";
export { NpmSource } from "./sources/npm.ts";
export type { NpmSourceOptions } from "./sources/npm.ts";

/**
 * Resolve a source string to the appropriate Source instance.
 *
 * Supports: local paths, `gh:owner/repo`, `npm:package`, `http(s)://...`
 */
export function resolveSource(input: string): Source {
  if (input.startsWith("http://") || input.startsWith("https://")) {
    return new HTTPSource(input);
  }
  if (input.startsWith("gh:")) {
    return new GitSource(input);
  }
  if (input.startsWith("npm:")) {
    return new NpmSource(input);
  }
  return new FSSource(input);
}
