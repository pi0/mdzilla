import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanNav, parseNumberedName, humanizeSlug } from "../src/nav.ts";

const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), "docs");
const simpleFixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), "fixture");

describe("parseNumberedName", () => {
  it("parses names", () => {
    expect(parseNumberedName("1.guide")).toMatchInlineSnapshot(
      `
      {
        "draft": false,
        "order": 1,
        "slug": "guide",
      }
    `,
    );
    expect(parseNumberedName("3.middleware.md")).toMatchInlineSnapshot(
      `
      {
        "draft": false,
        "order": 3,
        "slug": "middleware",
      }
    `,
    );
    expect(parseNumberedName("0.index.md")).toMatchInlineSnapshot(
      `
      {
        "draft": false,
        "order": 0,
        "slug": "index",
      }
    `,
    );
    expect(parseNumberedName("handle-cookie.md")).toMatchInlineSnapshot(
      `
      {
        "draft": false,
        "order": Infinity,
        "slug": "handle-cookie",
      }
    `,
    );
    expect(parseNumberedName("3.feature.draft.md")).toMatchInlineSnapshot(
      `
      {
        "draft": true,
        "order": 3,
        "slug": "feature",
      }
    `,
    );
  });
});

describe("humanizeSlug", () => {
  it("humanizes slugs", () => {
    expect(humanizeSlug("getting-started")).toBe("Getting Started");
    expect(humanizeSlug("guide")).toBe("Guide");
    expect(humanizeSlug("nested-apps")).toBe("Nested Apps");
  });
});

describe("scanNav", () => {
  it("builds nav from fixture", async () => {
    const nav = await scanNav(fixtureDir);
    expect(nav).toMatchSnapshot();
  });

  it("builds nav from simple fixture", async () => {
    const nav = await scanNav(simpleFixtureDir);
    expect(nav).toMatchInlineSnapshot(`
      [
        {
          "description": "Welcome to the docs",
          "icon": "i-heroicons-home",
          "order": 0,
          "path": "/",
          "slug": "",
          "title": "Welcome",
        },
        {
          "children": [
            {
              "description": "Get up and running quickly",
              "order": 0,
              "path": "/getting-started",
              "slug": "",
              "title": "Getting Started",
            },
            {
              "order": 1,
              "path": "/getting-started/installation",
              "slug": "installation",
              "title": "Installation",
            },
            {
              "heading": "Configuration",
              "icon": "i-heroicons-cog",
              "order": 2,
              "path": "/getting-started/configuration",
              "slug": "configuration",
              "title": "Config",
            },
          ],
          "icon": "i-heroicons-rocket-launch",
          "order": 1,
          "path": "/getting-started",
          "slug": "getting-started",
          "title": "Getting Started",
        },
        {
          "children": [
            {
              "order": 1,
              "path": "/api/methods",
              "slug": "methods",
              "title": "Methods",
            },
          ],
          "order": 2,
          "page": false,
          "path": "/api",
          "slug": "api",
          "title": "Api",
        },
      ]
    `);
  });

  it("includes drafts when enabled", async () => {
    const nav = await scanNav(simpleFixtureDir, { drafts: true });
    const draft = nav.find((e) => e.slug === "changelog");
    expect(draft).toMatchInlineSnapshot(`
      {
        "draft": true,
        "order": 3,
        "path": "/changelog",
        "slug": "changelog",
        "title": "Changelog",
      }
    `);
  });

  it("excludes drafts by default", async () => {
    const nav = await scanNav(simpleFixtureDir);
    expect(nav.find((e) => e.slug === "changelog")).toBeUndefined();
  });

  it("excludes navigation:false pages", async () => {
    const nav = await scanNav(simpleFixtureDir);
    const api = nav.find((e) => e.slug === "api");
    expect(api?.children?.find((e) => e.slug === "types")).toBeUndefined();
  });

  it("excludes _ prefixed dirs", async () => {
    const nav = await scanNav(simpleFixtureDir);
    expect(nav.find((e) => e.slug === "partials")).toBeUndefined();
  });

  it("respects frontmatter order override", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "nav-order-"));
    try {
      await writeFile(join(tmp, "alpha.md"), "---\norder: 1\n---\n# Alpha\n");
      await writeFile(join(tmp, "beta.md"), "---\norder: 0\n---\n# Beta\n");
      await writeFile(join(tmp, "gamma.md"), "# Gamma\n");
      const nav = await scanNav(tmp);
      expect(nav.map((e) => e.slug)).toEqual(["beta", "alpha", "gamma"]);
      expect(nav[0]!.order).toBe(0);
      expect(nav[1]!.order).toBe(1);
      expect(nav[2]!.order).toBe(Infinity);
    } finally {
      await rm(tmp, { recursive: true });
    }
  });

  it("respects navigation.order override", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "nav-order-"));
    try {
      await writeFile(join(tmp, "3.first.md"), "---\nnavigation:\n  order: 0\n---\n# First\n");
      await writeFile(join(tmp, "1.second.md"), "# Second\n");
      const nav = await scanNav(tmp);
      expect(nav.map((e) => e.slug)).toEqual(["first", "second"]);
      expect(nav[0]!.order).toBe(0);
      expect(nav[1]!.order).toBe(1);
    } finally {
      await rm(tmp, { recursive: true });
    }
  });
});
