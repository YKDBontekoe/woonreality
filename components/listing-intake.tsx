"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AddressSearch } from "@/components/address-search";
import { extractListingFacts, listingStorageKey, type UserListingDraft } from "@/src/lib/listing-intake";
import type { AddressSearchResult } from "@/src/lib/types";

export function ListingIntake() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [askingPrice, setAskingPrice] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [selected, setSelected] = useState<AddressSearchResult | null>(null);
  const [message, setMessage] = useState("");
  const [authContinue, setAuthContinue] = useState(false);

  function goToProperty(bagVboId: string) {
    router.push(`/woning/${encodeURIComponent(bagVboId)}`);
  }

  async function continueWith(result: AddressSearchResult) {
    const facts = extractListingFacts(pastedText);
    const price = Number(askingPrice) || facts.askingPrice;
    const draft: UserListingDraft = {
      bagVboId: result.bagVboId,
      askingPrice: price || undefined,
      sourceUrl: sourceUrl.trim() || undefined,
      pastedText: pastedText.trim() || undefined,
      facts,
    };
    try {
      sessionStorage.setItem(listingStorageKey(result.bagVboId), JSON.stringify(draft));
    } catch { /* private mode */ }
    setAuthContinue(false);
    try {
      const response = await fetch(`/api/listing/user/${encodeURIComponent(result.bagVboId)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ askingPrice: price || null, sourceUrl: sourceUrl.trim() || null, pastedText: pastedText.trim() || null }),
      });
      if (response.status === 401) {
        setMessage("We bewaren de gegevens op dit apparaat. Log later in om ze in je dossier te zetten.");
        setAuthContinue(true);
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: undefined })) as { error?: string };
        if (response.status === 400) setMessage(body.error ?? "Controleer de vraagprijs, bronlink of geplakte tekst.");
        else if (response.status === 502) setMessage(body.error ?? "Advertentiegegevens konden nu niet worden opgeslagen. Probeer het later opnieuw.");
        else setMessage(body.error ?? "Advertentiegegevens konden niet worden opgeslagen.");
        return;
      }
      goToProperty(result.bagVboId);
    } catch {
      setMessage("Geen verbinding. Controleer je netwerk en probeer het opnieuw.");
    }
  }

  return (
    <div className="listing-intake">
      <button className="text-link" type="button" onClick={() => setOpen((value) => !value)}>
        {open ? "Verberg advertentie-invoer" : "Ik heb al een advertentie — plak de gegevens"}
      </button>
      {open && (
        <div className="listing-intake-card">
          <p>We scrapen Funda of Pararius niet. Plak zelf de vraagprijs of een stuk tekst; de bronlink bewaren we alleen als referentie.</p>
          <AddressSearch id="advertentie-adres" submitLabel="Koppel adres" onSelect={setSelected} />
          {selected && <small className="listing-selected">Gekoppeld: {selected.displayName}</small>}
          <div className="listing-intake-grid">
            <label>Vraagprijs<input type="number" min="0" step="500" value={askingPrice} onChange={(event) => setAskingPrice(event.target.value)} placeholder="555000" /></label>
            <label>Bronlink (optioneel)<input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" /></label>
          </div>
          <label className="listing-paste">Tekst uit brochure of advertentie
            <textarea value={pastedText} onChange={(event) => setPastedText(event.target.value)} rows={5} placeholder="Plak hier de omschrijving, m², energielabel of VvE-bijdrage." />
          </label>
          {message && <p className="form-message" role="status">{message}</p>}
          {authContinue && selected && (
            <button className="secondary-button" type="button" onClick={() => goToProperty(selected.bagVboId)}>
              Toch verder naar de woningcheck
            </button>
          )}
          <button className="primary-button" type="button" disabled={!selected} onClick={() => { if (selected) void continueWith(selected); }}>
            Start woningcheck met deze gegevens
          </button>
        </div>
      )}
    </div>
  );
}
