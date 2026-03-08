/**
 * Shared npm registry utilities used by DocsSourceNpm and DocsSourceHTTP.
 */

/** Parsed npm package spec */
export interface NpmPackageSpec {
  name: string;
  version: string;
  subdir: string;
}

/**
 * Parse an npm package spec: `[@scope/]name[@version][/subdir]`
 */
export function parseNpmSpec(input: string): NpmPackageSpec {
  let rest = input;
  let subdir = "";

  if (rest.startsWith("@")) {
    // Scoped: @scope/pkg[/subdir] — first slash is part of scope
    const secondSlash = rest.indexOf("/", rest.indexOf("/") + 1);
    if (secondSlash > 0) {
      subdir = rest.slice(secondSlash);
      rest = rest.slice(0, secondSlash);
    }
  } else {
    const firstSlash = rest.indexOf("/");
    if (firstSlash > 0) {
      subdir = rest.slice(firstSlash);
      rest = rest.slice(0, firstSlash);
    }
  }

  // Split version: rest is now [@scope/]name[@version]
  const versionSep = rest.startsWith("@") ? rest.indexOf("@", 1) : rest.indexOf("@");
  const hasVersion = versionSep > 0;
  const name = hasVersion ? rest.slice(0, versionSep) : rest;
  const version = hasVersion ? rest.slice(versionSep + 1) : "latest";

  return { name, version, subdir };
}

/**
 * Fetch package metadata from the npm registry.
 * When `version` is provided, fetches that specific version.
 * Otherwise fetches the full package document.
 */
export async function fetchNpmInfo(
  name: string,
  version?: string,
): Promise<Record<string, unknown>> {
  const registryURL = version
    ? `https://registry.npmjs.org/${name}/${version}`
    : `https://registry.npmjs.org/${name}`;
  const res = await fetch(registryURL);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch package info for ${name}${version ? `@${version}` : ""}: ${res.status} ${res.statusText}`,
    );
  }
  return res.json() as Promise<Record<string, unknown>>;
}

/**
 * Detect npmjs.com URLs and extract the package name.
 * Supports: npmjs.com/\<pkg\>, npmjs.com/package/\<pkg\>, www.npmjs.com/package/\<pkg\>
 * Also handles scoped packages: npmjs.com/package/@scope/name
 */
export function parseNpmURL(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.hostname !== "www.npmjs.com" && parsed.hostname !== "npmjs.com") {
    return undefined;
  }
  // /package/@scope/name or /package/name
  const pkgMatch = parsed.pathname.match(/^\/package\/((?:@[^/]+\/)?[^/]+)\/?$/);
  if (pkgMatch) return pkgMatch[1];
  // Short form: npmjs.com/<name> (not a known route like /settings, /signup, etc.)
  const shortMatch = parsed.pathname.match(/^\/((?:@[^/]+\/)?[^/]+)\/?$/);
  if (shortMatch && !/^(package|settings|signup|login|org|search)$/.test(shortMatch[1]!)) {
    return shortMatch[1];
  }
  return undefined;
}
