import { isFundaListingUrl } from "@/src/lib/listing-import";
import { isHttpUrl } from "@/src/lib/listing-intake";
import { formatEuro } from "@/src/lib/purchase";
import type { PropertyListing } from "@/src/lib/types";

function formatDate(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function listingStatusLabel(status: PropertyListing["status"]) {
  return {
    active: "Te koop",
    sold: "Verkocht",
    withdrawn: "Ingetrokken",
    unknown: "Status onbekend",
  }[status];
}

function sourceIsOpenable(url: string) {
  if (!isHttpUrl(url)) return false;
  if (isFundaListingUrl(url)) return true;
  try {
    const parsed = new URL(url);
    return parsed.pathname !== "/" || Boolean(parsed.search);
  } catch {
    return false;
  }
}

export function ListingFactsCard({
  listing,
  status,
  eyebrow = "gelicentieerde marktdata",
  title = "Wat de advertentie zegt",
  description = "Advertentiegegevens staan los van BAG en openbare registraties. Controleer wijzigingen bij de aanbieder.",
  bagAreaM2,
  id = "advertentie",
}: {
  listing: PropertyListing | null;
  status: "loading" | "available" | "unavailable";
  eyebrow?: string;
  title?: string;
  description?: string;
  bagAreaM2?: number;
  id?: string;
}) {
  if (status === "loading") {
    return (
      <section className="listing-section">
        <div className="listing-loading">Advertentiedata wordt opgehaald…</div>
      </section>
    );
  }
  if (!listing) return null;

  const facts = [
    ["Woonoppervlak", listing.livingAreaM2 != null ? `${listing.livingAreaM2} m²` : undefined],
    ["Perceel", listing.plotAreaM2 != null ? `${listing.plotAreaM2} m²` : undefined],
    ["Inhoud", listing.volumeM3 != null ? `${listing.volumeM3} m³` : undefined],
    ["Kamers", listing.roomCount],
    ["Slaapkamers", listing.bedroomCount],
    ["Badkamers", listing.bathroomCount],
    ["Type", listing.propertyType],
    ["Bouwjaar", listing.constructionYear],
    ["Energielabel", listing.energyLabel],
    ["Isolatie", listing.insulation],
    ["Verwarming", listing.heating],
    ["Beglazing", listing.glazing],
    ["Zonnepanelen", listing.solarPanelCount],
    ["Buitenruimte", listing.outdoorSpaceM2 != null ? `${listing.outdoorSpaceM2} m²` : undefined],
    ["Tuinligging", listing.gardenOrientation],
    ["Balkon", listing.balcony == null ? undefined : listing.balcony ? "Ja" : "Nee"],
    ["Terras", listing.terrace == null ? undefined : listing.terrace ? "Ja" : "Nee"],
    ["Parkeren", listing.parking],
    ["Berging", listing.storage],
    ["VvE-bijdrage", listing.vveContribution != null ? formatEuro(listing.vveContribution) : undefined],
    ["VvE-reserve", listing.vveReserveFund != null ? formatEuro(listing.vveReserveFund) : undefined],
  ].filter(([, value]) => value !== undefined && value !== "—") as [string, string | number][];

  const areaConflict =
    bagAreaM2 != null &&
    listing.livingAreaM2 != null &&
    Math.abs(bagAreaM2 - listing.livingAreaM2) / Math.max(bagAreaM2, 1) >= 0.05;

  return (
    <section className="listing-section" id={id}>
      <div className="section-inline-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-dot" /> {eyebrow}
          </div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className="coverage-pill">{listingStatusLabel(listing.status)}</span>
      </div>
      <div className="listing-card">
        <div className="listing-price-row">
          <div>
            <span className="listing-label">Vraagprijs</span>
            <strong>{formatEuro(listing.askingPrice)}</strong>
            {listing.pricePerM2 != null && (
              <small>{formatEuro(listing.pricePerM2)} per m²</small>
            )}
          </div>
          <div className="listing-price-history">
            {listing.originalAskingPrice != null && (
              <span>Oorspronkelijk {formatEuro(listing.originalAskingPrice)}</span>
            )}
            {listing.priceChangeAmount != null && (
              <span>
                Wijziging {formatEuro(listing.priceChangeAmount)}
                {listing.priceChangePct != null ? ` (${listing.priceChangePct.toLocaleString("nl-NL")}%)` : ""}
              </span>
            )}
          </div>
        </div>
        <div className="listing-meta">
          <span>Gepubliceerd {formatDate(listing.firstPublishedAt)}</span>
          <span>Bijgewerkt {formatDate(listing.fetchedAt)}</span>
          {listing.offerDeadline && <span>Bieden tot {formatDate(listing.offerDeadline)}</span>}
        </div>
        {areaConflict && (
          <p className="listing-conflict">
            De advertentie noemt {listing.livingAreaM2} m², BAG {bagAreaM2} m². We overschrijven het BAG-oppervlak niet.
          </p>
        )}
        {facts.length > 0 && (
          <div className="listing-fact-grid">
            {facts.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        )}
        <div className="listing-footer">
          <span>
            Bron: {listing.provider} · opgehaald {formatDate(listing.fetchedAt)}
          </span>
          {sourceIsOpenable(listing.sourceUrl) && (
            <a href={listing.sourceUrl} target="_blank" rel="noreferrer">Open bron</a>
          )}
        </div>
      </div>
    </section>
  );
}
