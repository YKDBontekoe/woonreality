import { ViewingCompanion } from "@/components/viewing-companion";

export default async function ViewingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ViewingCompanion bagId={decodeURIComponent(slug)} />;
}
