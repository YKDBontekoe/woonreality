import type { Property } from "@/src/lib/types";

type EnergyResponse = {
  Energieklasse?: string;
  Registratiedatum?: string;
  Opnamedatum?: string;
  Status?: string;
};

export async function getEnergyLabel(property: Property): Promise<EnergyResponse | null> {
  const apiKey = process.env.EPONLINE_API_KEY;
  if (!apiKey) return null;
  const params = new URLSearchParams({ postcode: property.postcode.replace(/\s/g, ""), huisnummer: String(property.houseNumber) });
  if (property.houseLetter) params.set("huisletter", property.houseLetter);
  if (property.addition) params.set("huisnummertoevoeging", property.addition);
  const response = await fetch(`https://public.ep-online.nl/api/v5/PandEnergielabel/Adres?${params.toString()}`, {
    headers: { Accept: "application/json", Authorization: apiKey },
    next: { revalidate: 86_400 },
  });
  if (!response.ok) throw new Error(`EP-Online request failed (${response.status})`);
  const body = await response.json() as EnergyResponse | EnergyResponse[];
  return Array.isArray(body) ? body[0] ?? null : body;
}

export const epOnlineUrl = "https://ep-online.nl/";

