import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isValidBagId } from "@/src/lib/validation/workspace";
import { getPropertyById } from "@/src/lib/sources/pdok/bag";
import { ViewingCompanion } from "@/components/viewing-companion";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "woning" });
  const bagId = decodeURIComponent(slug);
  if (!isValidBagId(bagId)) return { title: t("meta.title") };
  try {
    const property = await getPropertyById(bagId);
    const label = `${property.street} ${property.houseNumber}${property.houseLetter ?? ""}${property.addition ?? ""}, ${property.city}`;
    return {
      title: t("meta.viewingTitle", { label }),
      robots: { index: false },
    };
  } catch {
    return { title: t("meta.title"), robots: { index: false } };
  }
}

export default async function ViewingPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  if (!isValidBagId(decodeURIComponent(slug))) notFound();
  return <ViewingCompanion bagId={decodeURIComponent(slug)} />;
}
