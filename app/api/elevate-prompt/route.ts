import { NextResponse } from "next/server";
import { OpenRouter } from "@openrouter/sdk";
import { searchUrls } from "@/lib/searchIndex";

export const maxDuration = 60;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = "openrouter/free";

/**
 * Takes a vague user goal, uses OpenRouter to craft a better search query,
 * then sends it to Brave + DDG to discover relevant source URLs.
 */
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
            {
              role: "system",
              content:
                "You are a search query optimizer. Given a user's vague request about Web3 opportunities (jobs, grants, hackathons, bounties), produce a concise, specific search query that would return the best results from search engines. Reply with ONLY the search query, nothing else. No quotes, no explanation.",
            },
            {
              role: "user",
              content: goal,
            },
          ],
          stream: false,
          maxCompletionTokens: 100,
        },
      },
      { timeoutMs: 30_000 },
    );

    const elevated =
      (
        result.choices[0]?.message as { content?: string } | undefined
      )?.content?.trim() || goal;

    // Use the elevated query to discover URLs
    const urls = await searchUrls(elevated, count);
    const payload = urls.map((url) => {
      try {
        return { url, name: new URL(url).hostname };
      } catch {
        return { url, name: url };
      }
    });

    return NextResponse.json({ elevatedQuery: elevated, urls: payload });
  } catch (e) {
    console.error("elevate-prompt:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Elevation failed" },
      { status: 500 },
    );
  }
}
