import { NextResponse } from "next/server";
import { searchAddresses } from "@/src/lib/sources/pdok/location";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 3) return NextResponse.json({ results: [] });

  try {
    const results = await searchAddresses(query);
    return NextResponse.json({ results }, { headers: { "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Address search failed" }, { status: 502 });
  }
}
