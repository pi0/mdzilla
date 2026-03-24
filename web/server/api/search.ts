import { defineHandler, getQuery } from "nitro/h3";
import { renderToText } from "md4x/napi";
import { useDocs } from "../docs.ts";
import { extractSnippets } from "mdzilla";

export default defineHandler(async (event) => {
  const { q, limit } = getQuery<{ q?: string; limit?: string }>(event);
  if (!q || q.length < 2) {
    return { results: [] };
  }

  const docs = await useDocs();
  const maxResults = Math.min(Number(limit) || 20, 50);
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);

  type ScoredResult = {
    path: string;
    title: string;
    heading?: string;
    snippets: string[];
    score: number;
  };

  const scored: ScoredResult[] = [];

  for await (const result of docs.search(q)) {
    const raw = await docs.getContent(result.flat);
    const plain = raw ? renderToText(raw) : "";
    const snippets = plain ? extractSnippets(plain, terms) : [];

    scored.push({
      path: result.flat.entry.path,
      title: result.flat.entry.title,
      heading: result.heading,
      snippets,
      score: result.score,
    });
  }

  // Sort by score (lower = better match) then truncate
  scored.sort((a, b) => a.score - b.score);
  const results = scored.slice(0, maxResults).map(({ score: _, ...r }) => r);

  return { results };
});
