import { NextResponse } from "next/server";
import { searchUrls } from "@/lib/searchIndex";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { query?: string; count?: number };
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const count = typeof body.count === "number" && body.count > 0 ? Math.min(body.count, 15) : 5;

    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    const urls = await searchUrls(query, count);
    const payload = urls.map((url) => {
      try {
        return { url, name: new URL(url).hostname };
      } catch {
        return { url, name: url };
      }
    });

    return NextResponse.json({ urls: payload });
  } catch (e) {
    console.error("search-urls:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Search failed" },
      { status: 500 }
    );
  }
}
