import { NextResponse } from "next/server";
import { getPropertyById } from "@/src/lib/sources/pdok/bag";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ bagId: string }> }) {
  const { bagId } = await context.params;
  try {
    const property = await getPropertyById(decodeURIComponent(bagId));
    return NextResponse.json({ property }, { headers: { "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Property lookup failed" }, { status: 502 });
  }
}
