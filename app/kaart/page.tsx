import { KaartPageContent } from "@/components/kaart-page-content";

export default async function KaartPage({
  searchParams,
}: {
  searchParams: Promise<{ layer?: string; lat?: string; lng?: string; z?: string }>;
}) {
  const params = await searchParams;
  return (
    <KaartPageContent
      initialLayer={params.layer}
      initialLat={params.lat}
      initialLng={params.lng}
      initialZoom={params.z}
    />
  );
}
