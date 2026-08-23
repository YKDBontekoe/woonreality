import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PropertyDashboard } from "@/components/property-dashboard";
import { isValidBagId } from "@/src/lib/validation/workspace";
import { getPropertyById } from "@/src/lib/sources/pdok/bag";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const bagId = decodeURIComponent(slug);
  if (!isValidBagId(bagId)) return { title: "Woningcheck" };
  try {
    const property = await getPropertyById(bagId);
    const label = `${property.street} ${property.houseNumber}${property.houseLetter ?? ""}${property.addition ?? ""}, ${property.city}`;
    return {
      title: `${label} — woningcheck`,
      description: `Reality check voor ${label}: open-data signalen, omgeving, risico's en bodhulp — met bronvermelding per gegeven.`,
    };
  } catch {
    return { title: "Woningcheck" };
  }
}

export default async function PropertyPage({ params }: Props) {
  const { slug } = await params;
  // Fail like /plek does: a garbage address is a 404, not a client-side
  // "woningcheck kon niet worden gemaakt" after failed fetches.
  if (!isValidBagId(decodeURIComponent(slug))) notFound();
  return <PropertyDashboard bagId={decodeURIComponent(slug)} />;
}
