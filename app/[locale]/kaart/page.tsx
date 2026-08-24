import { setRequestLocale } from "next-intl/server";
import { KaartPageContent } from "@/components/kaart-page-content";

type KaartSearchParams = {
  layer?: string | string[];
  lat?: string | string[];
  lng?: string | string[];
  z?: string | string[];
};

function queryParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function KaartPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<KaartSearchParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  return (
    <KaartPageContent
      initialLayer={queryParam(query.layer)}
      initialLat={queryParam(query.lat)}
      initialLng={queryParam(query.lng)}
      initialZoom={queryParam(query.z)}
    />
  );
}
