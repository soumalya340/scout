import { NextResponse } from "next/server";
import { scrapeUrlsWithGoal } from "@/lib/searchIndex";

export const maxDuration = 300;

const MAX_URLS = 12;

/** Normalize TinyFish output into a value the Scout UI can parse (array or string). */
function normalizeContent(content: unknown): unknown {
  if (content == null) return null;
  if (typeof content === "string") return content;
  if (typeof content === "object" && content !== null && "error" in content) return content;
  return content;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { urls?: string[]; goal?: string };
    const goal = typeof body.goal === "string" ? body.goal.trim() : "";
    const raw = Array.isArray(body.urls) ? body.urls : [];

    if (!goal) {
      return NextResponse.json({ error: "goal is required" }, { status: 400 });
    }

    const urls = raw
      .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
      .map((u) => u.trim())
      .slice(0, MAX_URLS);

    if (urls.length === 0) {
      return NextResponse.json({ error: "At least one URL is required" }, { status: 400 });
    }

    const started = Date.now();
    const pairs = await scrapeUrlsWithGoal(urls, goal);
    const durationMs = Date.now() - started;

    const results: Record<string, unknown> = {};
    for (const { url, content } of pairs) {
      results[url] = normalizeContent(content);
    }

    return NextResponse.json({ results, durationMs, urlCount: urls.length });
  } catch (e) {
    console.error("run-scrape:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Scrape failed" },
      { status: 500 }
    );
  }
}
