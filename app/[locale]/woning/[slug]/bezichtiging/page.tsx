import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { isValidBagId } from "@/src/lib/validation/workspace";
import { ViewingCompanion } from "@/components/viewing-companion";

export default async function ViewingPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  if (!isValidBagId(decodeURIComponent(slug))) notFound();
  return <ViewingCompanion bagId={decodeURIComponent(slug)} />;
}
