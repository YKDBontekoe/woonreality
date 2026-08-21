import { notFound } from "next/navigation";
import { PlaceDashboard } from "@/components/place-dashboard";
import type { PlaceKind } from "@/src/lib/types";

const PLACE_KINDS = new Set<PlaceKind>(["buurt", "gemeente", "woonplaats"]);

export default async function PlacePage({ params }: { params: Promise<{ kind: string; code: string }> }) {
  const { kind, code } = await params;
  if (!PLACE_KINDS.has(kind as PlaceKind)) notFound();
  return <PlaceDashboard kind={kind as PlaceKind} code={decodeURIComponent(code)} />;
}
