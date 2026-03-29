/**
 * Server-only search + TinyFish scrape (ported from repo root search_index.js).
 * Uses BRAVE_API_KEY and TINYFISH_API_KEY from env; DDG works without Brave.
 */

const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const TINYFISH_API_KEY = process.env.TINYFISH_API_KEY;

export async function duckDuckGoSearch(query: string, count = 5): Promise<string[]> {
  try {
    const response = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        },
      }
    );
    const html = await response.text();
    const matches = [...html.matchAll(/uddg=(https?[^"&]+)/g)];
    return matches
      .map((m) => decodeURIComponent(m[1]))
      .filter((u) => !u.includes("duckduckgo.com"))
      .slice(0, count);
  } catch (err) {
    console.warn("DDG failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function braveSearch(query: string, count = 5): Promise<string[]> {
  if (!BRAVE_API_KEY) return [];
  try {
    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`,
      {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": BRAVE_API_KEY,
        },
      }
    );
    if (!response.ok) return [];
    const data = (await response.json()) as {
      web?: { results?: { url?: string }[] };
    };
    const results = data.web?.results ?? [];
    return results.map((r) => r.url).filter((u): u is string => Boolean(u));
  } catch (err) {
    console.warn("Brave failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

/** Merge DDG + Brave URLs, dedupe by hostname. */
export async function searchUrls(query: string, count = 5): Promise<string[]> {
  const [ddgUrls, braveUrls] = await Promise.all([
    duckDuckGoSearch(query, count),
    braveSearch(query, count),
  ]);

  const seen = new Set<string>();
  const unique: string[] = [];

  for (const url of [...ddgUrls, ...braveUrls]) {
    try {
      const hostname = new URL(url).hostname;
      if (!seen.has(hostname)) {
        seen.add(hostname);
        unique.push(url);
      }
    } catch {
      /* invalid URL */
    }
  }

  /* Cap merged results; count is a hint from each engine (5 each). */
  return unique.slice(0, Math.min(unique.length, Math.max(count * 2, 10)));
}

/**
 * TinyFish COMPLETE events may use `result` and/or `resultJson` (string or object).
 * Returns `undefined` if the line is not a COMPLETE payload (keep reading SSE).
 */
function completeResultFromSseLine(line: string): unknown | null | undefined {
  if (!line.startsWith("data: ")) return undefined;
  try {
    const event = JSON.parse(line.slice(6)) as {
      type?: string;
      result?: unknown;
      resultJson?: unknown;
    };
    if (event.type !== "COMPLETE") return undefined;
    const r = event.result ?? event.resultJson;
    if (typeof r === "string") {
      try {
        return JSON.parse(r) as unknown;
      } catch {
        return r;
      }
    }
    return r ?? null;
  } catch {
    return undefined;
  }
}

export async function scrapeWithTinyFish(url: string, goal: string): Promise<unknown> {
  if (!TINYFISH_API_KEY) {
    throw new Error("TINYFISH_API_KEY is not configured");
  }

  const response = await fetch("https://agent.tinyfish.ai/v1/automation/run-sse", {
    method: "POST",
    headers: {
      "X-API-Key": TINYFISH_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, goal }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`TinyFish HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";

    for (const line of lines) {
      const out = completeResultFromSseLine(line);
      if (out !== undefined) return out;
    }
  }

  for (const line of buf.split("\n")) {
    const out = completeResultFromSseLine(line);
    if (out !== undefined) return out;
  }

  return null;
}

export async function scrapeUrlsWithGoal(
  urls: string[],
  goal: string
): Promise<{ url: string; content: unknown }[]> {
  const pairs = await Promise.all(
    urls.map(async (url) => {
      try {
        const content = await scrapeWithTinyFish(url, goal);
        return { url, content };
      } catch (e) {
        return {
          url,
          content: {
            error: e instanceof Error ? e.message : "Scrape failed",
          },
        };
      }
    })
  );
  console.log(`[searchIndex] scrapeUrlsWithGoal complete:\n${JSON.stringify(pairs, null, 2)}`);
  return pairs;
}
