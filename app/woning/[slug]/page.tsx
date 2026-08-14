import { PropertyDashboard } from "@/components/property-dashboard";

export default async function PropertyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PropertyDashboard bagId={decodeURIComponent(slug)} />;
}
