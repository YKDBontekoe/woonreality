import { ComparisonDashboard } from "@/components/comparison-dashboard";

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const params = await searchParams;
  const ids = (params.ids ?? "").split(",").filter((id) => /^\d{16}$/.test(id)).slice(0, 4);
  return <ComparisonDashboard bagIds={ids} />;
}

