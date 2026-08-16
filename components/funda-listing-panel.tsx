"use client";

import { Link2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { ListingFactsCard } from "@/components/listing-facts-card";
import { listingStorageKey, type UserListingDraft } from "@/src/lib/listing-intake";
import { isFundaListingUrl, type ImportedListingFacts } from "@/src/lib/listing-import";
import type { PropertyListing } from "@/src/lib/types";

type ImportResponse = {
  listing?: PropertyListing | null;
  facts?: ImportedListingFacts;
  persisted?: boolean;
  error?: string;
};

function storeDraft(bagId: string, sourceUrl: string, listing: PropertyListing, facts?: ImportedListingFacts) {
  const draft: UserListingDraft = {
    bagVboId: bagId,
    askingPrice: listing.askingPrice,
    sourceUrl,
    facts,
  };
  try {
    sessionStorage.setItem(listingStorageKey(bagId), JSON.stringify(draft));
  } catch { /* private mode */ }
}

export function FundaListingPanel({
  bagId,
  bagAreaM2,
  listing,
  licensedListing,
  onListingChange,
}: {
  bagId: string;
  bagAreaM2?: number;
  listing: PropertyListing | null;
  licensedListing: PropertyListing | null;
  onListingChange: (listing: PropertyListing | null) => void;
}) {
  const [sourceUrl, setSourceUrl] = useState(isFundaListingUrl(listing?.sourceUrl ?? "") ? listing?.sourceUrl ?? "" : "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (isFundaListingUrl(listing?.sourceUrl ?? "")) setSourceUrl(listing?.sourceUrl ?? "");
  }, [listing?.sourceUrl]);

  async function importListing() {
    const url = sourceUrl.trim();
    if (!isFundaListingUrl(url)) {
      setMessage("Plak de link van één Funda-woning, geen zoekresultaat.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/listing/user/${encodeURIComponent(bagId)}/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceUrl: url }),
      });
      const body = await response.json() as ImportResponse;
      if (!response.ok) {
        setMessage(body.error ?? "De Funda-pagina kon niet worden opgehaald. Plak de advertentietekst op de startpagina.");
        return;
      }
      if (body.listing) {
        onListingChange(body.listing);
        storeDraft(bagId, url, body.listing, body.facts);
      }
      if (body.persisted) setMessage("Advertentiegegevens opgehaald en in je dossier bewaard.");
      else setMessage("Advertentiegegevens opgehaald op dit apparaat. Log in om ze in je dossier te zetten.");
    } catch {
      setMessage("Geen verbinding. Controleer je netwerk en probeer het opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="funda-listing-panel" id="funda-link">
      <div className="section-inline-heading">
        <div>
          <div className="eyebrow"><Link2 size={13} /> advertentie aanvullen</div>
          <h2>Funda-link toevoegen</h2>
          <p>
            Open data heeft geen vraagprijs of kamers. Plak de link van deze woning op Funda;
            we halen alleen die pagina op en vullen wat ontbreekt. BAG en energielabel blijven leidend.
          </p>
        </div>
      </div>
      <div className="listing-intake-card funda-listing-form">
        <label>
          Funda-advertentielink
          <input
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://www.funda.nl/detail/koop/…"
            inputMode="url"
            autoComplete="url"
          />
        </label>
        <button className="primary-button" type="button" disabled={busy || !sourceUrl.trim()} onClick={() => { void importListing(); }}>
          {busy ? <RefreshCw size={14} className="spin" /> : <Link2 size={14} />}
          {busy ? "Gegevens ophalen…" : listing ? "Opnieuw ophalen" : "Haal gegevens op"}
        </button>
        {message && <p className="form-message" role="status">{message}</p>}
      </div>
      {!licensedListing && listing && (
        <ListingFactsCard
          listing={listing}
          status="available"
          eyebrow="jouw advertentie"
          title="Jouw advertentie"
          description="Deze kenmerken komen uit de Funda-link die jij plakte. Ze staan los van BAG en openbare registraties."
          bagAreaM2={bagAreaM2}
          id="jouw-advertentie"
        />
      )}
    </section>
  );
}
