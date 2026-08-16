import { NextResponse } from "next/server";
import { toUserMessage } from "@/src/lib/errors";
import { getPropertyById } from "@/src/lib/sources/pdok/bag";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ bagId: string }> }) {
  const { bagId } = await context.params;
  try {
    const property = await getPropertyById(decodeURIComponent(bagId));
    return NextResponse.json({ property }, { headers: { "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400" } });
  } catch (error) {
    console.error("Property lookup failed", error);
    return NextResponse.json({ error: toUserMessage(error, "Dit adres kon niet worden opgehaald. Probeer het later opnieuw.") }, { status: 502 });
  }
}
