import { NextResponse } from "next/server";
import { privateHeaders, routeError } from "@/src/lib/api/handlers";
import { getPropertyById } from "@/src/lib/sources/pdok/bag";
import { getListingProvider } from "@/src/lib/sources/listings";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ bagId: string }> }) {
  const provider = getListingProvider();
  if (!provider) {
    return NextResponse.json({ error: "No licensed listing provider is configured" }, { status: 503 });
  }

  const { bagId } = await context.params;
  try {
    const property = await getPropertyById(decodeURIComponent(bagId));
    const listing = await provider.lookup(property);
    if (!listing) return NextResponse.json({ listing: null }, { status: 404 });
    return NextResponse.json({ listing }, { headers: privateHeaders() });
  } catch (error) {
    return routeError(error, "Listing lookup failed");
  }
}
