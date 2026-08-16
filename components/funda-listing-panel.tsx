"use client";

import { ClipboardPaste, Link2, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ListingFactsCard } from "@/components/listing-facts-card";
import { listingStorageKey, type UserListingDraft } from "@/src/lib/listing-intake";
import { isFundaListingUrl, type ImportedListingFacts } from "@/src/lib/listing-import";
import type { PropertyListing } from "@/src/lib/types";

type ImportResponse = {
  listing?: PropertyListing | null;
  facts?: ImportedListingFacts;
  blocked?: boolean;
  persisted?: boolean;
  error?: string;
};

function storeDraft(
  bagId: string,
  sourceUrl: string,
  listing: PropertyListing,
  facts?: ImportedListingFacts,
  blocked?: boolean,
  notice?: string,
) {
  let existing: UserListingDraft | null = null;
  try {
    const raw = sessionStorage.getItem(listingStorageKey(bagId));
    existing = raw ? JSON.parse(raw) as UserListingDraft : null;
  } catch { /* private mode */ }
  const draft: UserListingDraft = {
    ...existing,
    bagVboId: bagId,
    askingPrice: listing.askingPrice ?? existing?.askingPrice,
    sourceUrl,
    pastedText: existing?.pastedText,
    facts: facts ?? existing?.facts,
    blocked: blocked ?? existing?.blocked,
    notice: notice ?? (blocked ? existing?.notice : undefined),
  };
  try {
    sessionStorage.setItem(listingStorageKey(bagId), JSON.stringify(draft));
  } catch { /* private mode */ }
}

function needsPasteFallback(listing: PropertyListing | null, blockedHint: boolean) {
  if (blockedHint) return true;
  if (!listing) return false;
  const notes = listing.notes ?? [];
  if (notes.some((note) => /mensen-check|niet vrij|pagina-html|niet worden opgehaald/i.test(note))) return true;
  return listing.askingPrice == null && listing.livingAreaM2 == null && !listing.description;
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
  const [pastedContent, setPastedContent] = useState("");
  const [blockedHint, setBlockedHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const sourceUrlTouchedRef = useRef(false);

  useEffect(() => {
    if (sourceUrlTouchedRef.current) return;
    if (isFundaListingUrl(listing?.sourceUrl ?? "")) setSourceUrl(listing?.sourceUrl ?? "");
  }, [listing?.sourceUrl]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(listingStorageKey(bagId));
      const draft = raw ? JSON.parse(raw) as UserListingDraft : null;
      if (draft?.blocked) setBlockedHint(true);
      if (draft?.pastedText) setPastedContent((current) => current || draft.pastedText || "");
      if (draft?.notice) setMessage(draft.notice);
    } catch { /* private mode */ }
  }, [bagId]);

  const showPaste = needsPasteFallback(listing, blockedHint) || Boolean(pastedContent.trim());

  async function importListing(withPaste: boolean) {
    const url = sourceUrl.trim();
    if (!isFundaListingUrl(url)) {
      setMessage("Plak de link van één Funda-woning, geen zoekresultaat.");
      return;
    }
    if (withPaste && !pastedContent.trim()) {
      setMessage("Plak eerst kenmerken of de pagina-HTML uit Funda.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/listing/user/${encodeURIComponent(bagId)}/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceUrl: url,
          ...(withPaste || pastedContent.trim() ? { pastedContent: pastedContent.trim() } : {}),
        }),
      });
      const body = await response.json() as ImportResponse;
      if (!response.ok) {
        setBlockedHint(Boolean(body.blocked) || needsPasteFallback(listing, true));
        setMessage(body.error ?? "De Funda-pagina kon niet worden opgehaald. Plak kenmerken of de pagina-HTML.");
        return;
      }
      if (body.listing) {
        onListingChange(body.listing);
        const notice = body.blocked
          ? "Funda vroeg om een mensen-check. Open de advertentie in je browser, kopieer kenmerken of pagina-HTML, en plak die hier."
          : body.persisted
            ? "Advertentiegegevens opgehaald en in je dossier bewaard."
            : "Advertentiegegevens opgehaald op dit apparaat. Log in om ze in je dossier te zetten.";
        storeDraft(bagId, url, body.listing, body.facts, body.blocked, notice);
        setBlockedHint(Boolean(body.blocked));
        setMessage(notice);
      } else {
        setBlockedHint(Boolean(body.blocked));
        setMessage("Er kwamen geen advertentiegegevens terug. Plak kenmerken of pagina-HTML en probeer opnieuw.");
      }
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
            onChange={(event) => {
              sourceUrlTouchedRef.current = true;
              setSourceUrl(event.target.value);
            }}
            placeholder="https://www.funda.nl/detail/koop/…"
            inputMode="url"
            autoComplete="url"
          />
        </label>
        {showPaste && (
          <label className="listing-paste">
            Kenmerken of pagina-HTML uit Funda
            <textarea
              value={pastedContent}
              onChange={(event) => setPastedContent(event.target.value)}
              rows={6}
              placeholder={"Open de Funda-pagina in je browser (mensen-check daar afronden). Kopieer daarna kenmerken, omschrijving, of de pagina-HTML, en plak die hier.\n\nVoorbeeld: Vraagprijs € 525.000 · Woonoppervlakte 128 m² · 4 kamers · Energielabel C"}
            />
          </label>
        )}
        <div className="funda-listing-actions">
          <button className="primary-button" type="button" disabled={busy || !sourceUrl.trim()} onClick={() => { void importListing(false); }}>
            {busy ? <RefreshCw size={14} className="spin" /> : <Link2 size={14} />}
            {busy ? "Gegevens ophalen…" : listing ? "Opnieuw ophalen" : "Haal gegevens op"}
          </button>
          {showPaste && (
            <button className="secondary-button" type="button" disabled={busy || !sourceUrl.trim() || !pastedTextReady(pastedContent)} onClick={() => { void importListing(true); }}>
              <ClipboardPaste size={14} />
              Vul aan met geplakte tekst
            </button>
          )}
          {!showPaste && (
            <button className="text-link" type="button" onClick={() => setBlockedHint(true)}>
              Lukt ophalen niet? Plak kenmerken of HTML
            </button>
          )}
        </div>
        {message && <p className="form-message" role="status">{message}</p>}
      </div>
      {!licensedListing && listing && (
        <ListingFactsCard
          listing={listing}
          status="available"
          eyebrow="jouw advertentie"
          title="Jouw advertentie"
          description="Deze kenmerken komen uit de Funda-link of tekst die jij plakte. Ze staan los van BAG en openbare registraties."
          bagAreaM2={bagAreaM2}
          id="jouw-advertentie"
        />
      )}
    </section>
  );
}

function pastedTextReady(value: string) {
  return value.trim().length >= 20;
}
