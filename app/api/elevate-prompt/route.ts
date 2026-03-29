import { NextResponse } from "next/server";
import { OpenRouter } from "@openrouter/sdk";
import { searchUrls } from "@/lib/searchIndex";

export const maxDuration = 60;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = "openrouter/free";

const SYSTEM_PROMPT = `You are a search query optimizer for Web3 job/opportunity searches.

Given a user's request, do TWO things:

1. **keywords**: Extract the core keywords that MUST appear in relevant results. These are the non-negotiable terms — role type, technology, ecosystem, seniority, etc. Return 2-5 keywords.

2. **query**: Produce a tight, specific search engine query. The query MUST keep every keyword from step 1. Do NOT broaden or generalize — if the user says "Solana developer", the query must include "Solana developer", not just "blockchain developer" or "web3 jobs".

Reply as JSON only, no markdown fences:
{"keywords":["keyword1","keyword2"],"query":"the search query"}`;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { goal?: string; count?: number };
    const goal = typeof body.goal === "string" ? body.goal.trim() : "";
    const count =
      typeof body.count === "number" && body.count > 0
        ? Math.min(body.count, 15)
        : 5;

    if (!goal) {
      return NextResponse.json(
        { error: "goal is required" },
        { status: 400 },
      );
    }

    if (!OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: "OPENROUTER_API_KEY is not configured. Add it to your .env file." },
        { status: 503 },
      );
    }

    const openRouter = new OpenRouter({
      apiKey: OPENROUTER_API_KEY,
      httpReferer: "http://localhost",
      appTitle: "Scout Opportunity Hunter",
      timeoutMs: 30_000,
    });

    const result = await openRouter.chat.send(
      {
        chatGenerationParams: {
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: goal },
          ],
          stream: false,
          maxCompletionTokens: 150,
        },
      },
      { timeoutMs: 30_000 },
    );

    const raw =
      (
        result.choices[0]?.message as { content?: string } | undefined
      )?.content?.trim() || "";

    let elevated = goal;
    let keywords: string[] = [];

    try {
      // Strip markdown fences if present
      const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
      const parsed = JSON.parse(cleaned) as {
        keywords?: string[];
        query?: string;
      };
      if (typeof parsed.query === "string" && parsed.query.trim()) {
        elevated = parsed.query.trim();
      }
      if (Array.isArray(parsed.keywords)) {
        keywords = parsed.keywords.filter(
          (k): k is string => typeof k === "string" && k.trim().length > 0,
        );
      }
    } catch {
      // If parsing fails, use raw as query and extract keywords from goal
      if (raw.length > 5 && raw.length < 200) elevated = raw;
      keywords = goal
        .split(/[\s,]+/)
        .filter((w) => w.length > 2)
        .slice(0, 5);
    }

    // Use the elevated query to discover URLs
    const urls = await searchUrls(elevated, count);
    const payload = urls.map((url) => {
      try {
        return { url, name: new URL(url).hostname };
      } catch {
        return { url, name: url };
      }
    });

    return NextResponse.json({ elevatedQuery: elevated, keywords, urls: payload });
  } catch (e) {
    console.error("elevate-prompt:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Elevation failed" },
      { status: 500 },
    );
  }
}
