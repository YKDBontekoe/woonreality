import { NextResponse } from "next/server";
import { redactError, toUserMessage } from "@/src/lib/errors";
import { searchLocations } from "@/src/lib/sources/pdok/location";
import { requireSearchLogin } from "@/src/lib/search-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 3) return NextResponse.json({ results: [] });

  const denied = await requireSearchLogin();
  if (denied) return denied;

  try {
    const results = await searchLocations(query);
    return NextResponse.json({ results }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Address search failed", redactError(error));
    return NextResponse.json({ error: toUserMessage(error, "Zoeken naar adressen lukt nu niet. Probeer het later opnieuw.") }, { status: 502 });
  }
}
