import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PropertyDashboard } from "@/components/property-dashboard";
import { isValidBagId } from "@/src/lib/validation/workspace";
import { getPropertyById } from "@/src/lib/sources/pdok/bag";

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "woning" });
  const bagId = decodeURIComponent(slug);
  if (!isValidBagId(bagId)) return { title: t("meta.title") };
  try {
    const property = await getPropertyById(bagId);
    const label = `${property.street} ${property.houseNumber}${property.houseLetter ?? ""}${property.addition ?? ""}, ${property.city}`;
    return {
      title: t("meta.titleWithAddress", { label }),
      description: t("meta.description", { label }),
    };
  } catch {
    return { title: t("meta.title") };
  }
}

export default async function PropertyPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  // Fail like /plek does: a garbage address is a 404, not a client-side
  // "woningcheck kon niet worden gemaakt" after failed fetches.
  if (!isValidBagId(decodeURIComponent(slug))) notFound();
  return <PropertyDashboard bagId={decodeURIComponent(slug)} />;
}
