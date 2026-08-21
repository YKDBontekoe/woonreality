import { KaartPageContent } from "@/components/kaart-page-content";

function queryParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function KaartPage({ searchParams }: PageProps<"/kaart">) {
  const params = await searchParams;
  return (
    <KaartPageContent
      initialLayer={queryParam(params.layer)}
      initialLat={queryParam(params.lat)}
      initialLng={queryParam(params.lng)}
      initialZoom={queryParam(params.z)}
    />
  );
}
