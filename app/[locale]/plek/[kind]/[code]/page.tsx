import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PlaceDashboard } from "@/components/place-dashboard";
import { placeKindLabels } from "@/src/lib/place-labels";
import type { PlaceKind } from "@/src/lib/types";

const PLACE_KINDS = new Set<PlaceKind>(["buurt", "gemeente", "woonplaats"]);

type Props = { params: Promise<{ locale: string; kind: string; code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, kind } = await params;
  const t = await getTranslations({ locale, namespace: "plek" });
  const kindLabel = placeKindLabels[kind as PlaceKind] ?? t("kindFallback");
  return {
    title: t("metaTitle", { kind: kindLabel.toLowerCase() }),
    description: t("metaDescription", { kind: kindLabel.toLowerCase() }),
  };
}

export default async function PlacePage({ params }: Props) {
  const { locale, kind, code } = await params;
  setRequestLocale(locale);
  if (!PLACE_KINDS.has(kind as PlaceKind)) notFound();
  return <PlaceDashboard kind={kind as PlaceKind} code={decodeURIComponent(code)} />;
}
