import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlaceDashboard } from "@/components/place-dashboard";
import { placeKindLabels } from "@/src/lib/place-labels";
import type { PlaceKind } from "@/src/lib/types";

const PLACE_KINDS = new Set<PlaceKind>(["buurt", "gemeente", "woonplaats"]);

type Props = { params: Promise<{ kind: string; code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { kind } = await params;
  const kindLabel = placeKindLabels[kind as PlaceKind] ?? "Plek";
  return {
    title: `Plekcheck ${kindLabel.toLowerCase()}`,
    description: `Reality check voor deze ${kindLabel.toLowerCase()}: inwoners, WOZ, scholen, groen en veiligheid uit open bronnen.`,
  };
}

export default async function PlacePage({ params }: Props) {
  const { kind, code } = await params;
  if (!PLACE_KINDS.has(kind as PlaceKind)) notFound();
  return <PlaceDashboard kind={kind as PlaceKind} code={decodeURIComponent(code)} />;
}
