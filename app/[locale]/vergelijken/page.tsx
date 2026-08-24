import { setRequestLocale } from "next-intl/server";
import { ComparisonDashboard } from "@/components/comparison-dashboard";
import { PlaceComparisonDashboard } from "@/components/place-comparison-dashboard";
import { parsePlaceParam } from "@/src/lib/place-compare";
import { isValidBagId } from "@/src/lib/validation/workspace";

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ids?: string; places?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const places = parsePlaceParam(query.places);
  // One explicit place is enough to switch modes: the dashboard merges
  // additional session-stored picks client-side.
  if (places.length >= 1) {
    return <PlaceComparisonDashboard initialRefs={places} />;
  }
  const rawIds = (query.ids ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  const validIds = [...new Set(rawIds.filter((id) => isValidBagId(id)))].slice(0, 4);
  const invalidCount = rawIds.length - rawIds.filter((id) => isValidBagId(id)).length;
  return <ComparisonDashboard bagIds={validIds} invalidCount={invalidCount} />;
}
