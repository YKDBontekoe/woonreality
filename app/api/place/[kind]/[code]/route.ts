import { NextResponse } from "next/server";
import { analyzePlace } from "@/src/lib/analysis/analyze-place";
import { redactError, toUserMessage } from "@/src/lib/errors";
import { requireSearchLogin } from "@/src/lib/search-auth";
import type { PlaceKind } from "@/src/lib/types";

export const runtime = "nodejs";

const PLACE_KINDS = new Set<PlaceKind>(["buurt", "gemeente", "woonplaats"]);

export async function GET(_request: Request, context: { params: Promise<{ kind: string; code: string }> }) {
  const denied = await requireSearchLogin();
  if (denied) return denied;

  const { kind, code } = await context.params;
  if (!PLACE_KINDS.has(kind as PlaceKind)) {
    return NextResponse.json({ error: "Onbekend gebiedstype." }, { status: 400 });
  }

  try {
    const place = await analyzePlace(kind as PlaceKind, decodeURIComponent(code));
    if (!place) {
      return NextResponse.json({ error: "Deze plek kon niet worden gevonden." }, { status: 404 });
    }
    return NextResponse.json({ place }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Place analysis failed", redactError(error));
    return NextResponse.json(
      { error: toUserMessage(error, "Deze plekcheck lukt nu niet. Probeer het later opnieuw.") },
      { status: 502 },
    );
  }
}
