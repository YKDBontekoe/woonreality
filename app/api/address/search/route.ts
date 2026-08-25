import { NextResponse } from "next/server";
import { apiContext, privateHeaders, routeError } from "@/src/lib/api/handlers";
import { filterSearchResults, searchLocations } from "@/src/lib/sources/pdok/location";
import { requireSearchLogin } from "@/src/lib/search-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { t } = apiContext(request);
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 3) return NextResponse.json({ results: [] });

  const denied = await requireSearchLogin();
  if (denied) return denied;

  const addressesOnly = ["1", "true"].includes(new URL(request.url).searchParams.get("addressesOnly")?.trim().toLowerCase() ?? "");

  try {
    const results = filterSearchResults(await searchLocations(query), addressesOnly);
    return NextResponse.json({ results }, { headers: privateHeaders() });
  } catch (error) {
    return routeError(error, t("errors.addressSearch"));
  }
}
