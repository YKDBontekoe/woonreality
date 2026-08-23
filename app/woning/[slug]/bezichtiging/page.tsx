import { notFound } from "next/navigation";
import { isValidBagId } from "@/src/lib/validation/workspace";
import { ViewingCompanion } from "@/components/viewing-companion";

export default async function ViewingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isValidBagId(decodeURIComponent(slug))) notFound();
  return <ViewingCompanion bagId={decodeURIComponent(slug)} />;
}
