"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { AddressSearch } from "@/components/address-search";
import { listingStorageKey, type UserListingDraft } from "@/src/lib/listing-intake";
import { isFundaListingUrl, type ImportedListingFacts } from "@/src/lib/listing-import";
import type { AddressSearchResult } from "@/src/lib/types";

export function ListingIntake() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [askingPrice, setAskingPrice] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [selected, setSelected] = useState<AddressSearchResult | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [authContinue, setAuthContinue] = useState(false);

  function goToProperty(bagVboId: string) {
    router.push(`/woning/${encodeURIComponent(bagVboId)}`);
  }

  async function continueWith(result: AddressSearchResult) {
    const url = sourceUrl.trim();
    const price = Number(askingPrice) || undefined;
    let facts: ImportedListingFacts = price ? { askingPrice: price, notes: [] } : { notes: [] };
    let notice: string | undefined;
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
          facts = { ...importBody.facts, ...(price ? { askingPrice: price } : {}) };
          notice = "Kenmerken volgen via de extensie zodra je de advertentie op Funda opent.";
          setMessage(notice);
        } else {
          notice = importBody.error ?? "Deze Funda-link kon niet worden gekoppeld.";
          setMessage(notice);
        }
      } catch {
        notice = "De Funda-link kon nu niet worden gekoppeld.";
        setMessage(notice);
      }
    } else if (url) {
      notice = "Alleen een Funda-advertentielink wordt herkend. Andere links bewaren we als referentie.";
      setMessage(notice);
    }

    const draft: UserListingDraft = {
      bagVboId: result.bagVboId,
      askingPrice: facts.askingPrice || price || undefined,
      sourceUrl: url || undefined,
      facts,
      blocked: Boolean(notice) || (!facts.askingPrice && !facts.livingAreaM2 && !facts.description),
      notice,
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
        if (response.status === 400) setMessage(body.error ?? "Controleer de vraagprijs of bronlink.");
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
            Plak de Funda-link van één woning voor het officiële adres. Vraagprijs en kenmerken komen uit de{" "}
            <Link href="/extensie">browser-extensie</Link> wanneer je de advertentie opent — we scrapen Funda niet vanaf de server.
          </p>
          <AddressSearch id="advertentie-adres" submitLabel="Koppel adres" onSelect={setSelected} />
          {selected && <small className="listing-selected">Gekoppeld: {selected.displayName}</small>}
          <div className="listing-intake-grid">
            <label>Vraagprijs (optioneel)<input type="number" min="0" step="500" value={askingPrice} onChange={(event) => setAskingPrice(event.target.value)} placeholder="555000" /></label>
            <label>Funda-link<input type="url" inputMode="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://www.funda.nl/detail/koop/…" /></label>
          </div>
          {message && <p className="form-message" role="status">{message}</p>}
          {authContinue && selected && (
            <button className="secondary-button" type="button" onClick={() => goToProperty(selected.bagVboId)}>
              Toch verder naar de woningcheck
            </button>
          )}
          <button className="primary-button" type="button" disabled={!selected || busy} onClick={() => { if (selected) void continueWith(selected); }}>
            {busy ? "Gegevens bewaren…" : "Start woningcheck met deze gegevens"}
          </button>
        </div>
      )}
    </div>
  );
}
