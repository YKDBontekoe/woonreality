import { ComparisonDashboard } from "@/components/comparison-dashboard";
import { PlaceComparisonDashboard } from "@/components/place-comparison-dashboard";
import { parsePlaceParam } from "@/src/lib/place-compare";

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string; places?: string }> }) {
  const params = await searchParams;
  const places = parsePlaceParam(params.places);
  // One explicit place is enough to switch modes: the dashboard merges
  // additional session-stored picks client-side.
  if (places.length >= 1) {
    return <PlaceComparisonDashboard initialRefs={places} />;
  }
  const ids = (params.ids ?? "").split(",").filter((id) => /^\d{16}$/.test(id)).slice(0, 4);
  return <ComparisonDashboard bagIds={ids} />;
}
