"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AddressSearch } from "@/components/address-search";
import { extractListingFacts, listingStorageKey, type UserListingDraft } from "@/src/lib/listing-intake";
import { isFundaListingUrl, mergeListingFacts, type ImportedListingFacts } from "@/src/lib/listing-import";
import type { AddressSearchResult } from "@/src/lib/types";

export function ListingIntake() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [askingPrice, setAskingPrice] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [selected, setSelected] = useState<AddressSearchResult | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [authContinue, setAuthContinue] = useState(false);

  function goToProperty(bagVboId: string) {
    router.push(`/woning/${encodeURIComponent(bagVboId)}`);
  }

  async function continueWith(result: AddressSearchResult) {
    const url = sourceUrl.trim();
    const pastedFacts = extractListingFacts(pastedText) as ImportedListingFacts;
    const price = Number(askingPrice) || pastedFacts.askingPrice;
    let facts = price ? { ...pastedFacts, askingPrice: price } : pastedFacts;
    setBusy(true);
    setAuthContinue(false);
    setMessage("");

    if (isFundaListingUrl(url)) {
      try {
        const importResponse = await fetch(`/api/listing/user/${encodeURIComponent(result.bagVboId)}/import`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sourceUrl: url }),
        });
        const importBody = await importResponse.json() as { facts?: ImportedListingFacts; error?: string };
        if (importResponse.ok && importBody.facts) {
          facts = mergeListingFacts(facts, importBody.facts);
        } else {
          setMessage(importBody.error ?? "Funda gaf de pagina niet vrij. We gebruiken je geplakte tekst.");
        }
      } catch {
        setMessage("Funda kon nu niet worden opgehaald. We gebruiken je geplakte tekst.");
      }
    } else if (url) {
      setMessage("Alleen een Funda-advertentielink wordt automatisch ingelezen. Andere links bewaren we als referentie.");
    }

    const draft: UserListingDraft = {
      bagVboId: result.bagVboId,
      askingPrice: facts.askingPrice || price || undefined,
      sourceUrl: url || undefined,
      pastedText: pastedText.trim() || undefined,
      facts,
    };
    try {
      sessionStorage.setItem(listingStorageKey(result.bagVboId), JSON.stringify(draft));
    } catch { /* private mode */ }

    try {
      const response = await fetch(`/api/listing/user/${encodeURIComponent(result.bagVboId)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          askingPrice: draft.askingPrice ?? null,
          sourceUrl: url || null,
          pastedText: pastedText.trim() || null,
        }),
      });
      if (response.status === 401) {
        setMessage("We bewaren de gegevens op dit apparaat. Log later in om ze in je dossier te zetten.");
        setAuthContinue(true);
        setBusy(false);
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: undefined })) as { error?: string };
        if (response.status === 400) setMessage(body.error ?? "Controleer de vraagprijs, bronlink of geplakte tekst.");
        else if (response.status === 502) setMessage(body.error ?? "Advertentiegegevens konden nu niet worden opgeslagen. Probeer het later opnieuw.");
        else setMessage(body.error ?? "Advertentiegegevens konden niet worden opgeslagen.");
        setBusy(false);
        return;
      }
      goToProperty(result.bagVboId);
    } catch {
      setMessage("Geen verbinding. Controleer je netwerk en probeer het opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="listing-intake">
      <button className="text-link" type="button" onClick={() => setOpen((value) => !value)}>
        {open ? "Verberg advertentie-invoer" : "Ik heb al een advertentie — plak de Funda-link"}
      </button>
      {open && (
        <div className="listing-intake-card">
          <p>
            Plak de Funda-link van één woning. We halen alleen die pagina op voor vraagprijs, kamers en andere kenmerken die open data mist.
            Zoekresultaten scrapen we niet. Lukt ophalen niet, plak dan zelf de tekst.
          </p>
          <AddressSearch id="advertentie-adres" submitLabel="Koppel adres" onSelect={setSelected} />
          {selected && <small className="listing-selected">Gekoppeld: {selected.displayName}</small>}
          <div className="listing-intake-grid">
            <label>Vraagprijs<input type="number" min="0" step="500" value={askingPrice} onChange={(event) => setAskingPrice(event.target.value)} placeholder="555000" /></label>
            <label>Funda-link<input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://www.funda.nl/detail/koop/…" /></label>
          </div>
          <label className="listing-paste">Tekst uit brochure of advertentie
            <textarea value={pastedText} onChange={(event) => setPastedText(event.target.value)} rows={5} placeholder="Fallback: plak hier de omschrijving, m², energielabel of VvE-bijdrage." />
          </label>
          {message && <p className="form-message" role="status">{message}</p>}
          {authContinue && selected && (
            <button className="secondary-button" type="button" onClick={() => goToProperty(selected.bagVboId)}>
              Toch verder naar de woningcheck
            </button>
          )}
          <button className="primary-button" type="button" disabled={!selected || busy} onClick={() => { if (selected) void continueWith(selected); }}>
            {busy ? "Gegevens ophalen…" : "Start woningcheck met deze gegevens"}
          </button>
        </div>
      )}
    </div>
  );
}
