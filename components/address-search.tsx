"use client";

import { Link2, MapPin, Search, Sparkles } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { listingStorageKey, type UserListingDraft } from "@/src/lib/listing-intake";
import { isFundaListingUrl, type ImportedListingFacts } from "@/src/lib/listing-import";
import type { AddressSearchResult, PropertyListing } from "@/src/lib/types";

const quickAddresses = ["Korenstraat 18, Epe", "Witte de Withstraat 42, Rotterdam", "Biltstraat 65, Utrecht"];

type SearchMode = "adres" | "funda";

type FromUrlResponse = {
  address?: AddressSearchResult;
  listing?: PropertyListing;
  facts?: ImportedListingFacts;
  blocked?: boolean;
  persisted?: boolean;
  error?: string;
};

function storeDraft(
  bagId: string,
  sourceUrl: string,
  listing?: PropertyListing,
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
    askingPrice: listing?.askingPrice ?? facts?.askingPrice ?? existing?.askingPrice,
    sourceUrl,
    pastedText: existing?.pastedText,
    facts: facts ?? existing?.facts,
    blocked: blocked ?? existing?.blocked,
    notice: notice ?? existing?.notice,
  };
  try {
    sessionStorage.setItem(listingStorageKey(bagId), JSON.stringify(draft));
  } catch { /* private mode */ }
}

export function AddressSearch({
  onSelect,
  submitLabel = "Bekijk adres",
  id = "zoek-adres",
}: {
  onSelect?: (result: AddressSearchResult) => void;
  submitLabel?: string;
  id?: string;
}) {
  const router = useRouter();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);
  const dismissedRef = useRef(false);
  const [mode, setMode] = useState<SearchMode>("adres");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddressSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searched, setSearched] = useState(false);

  const fundaMode = mode === "funda" || isFundaListingUrl(query);

  useEffect(() => {
    if (isFundaListingUrl(query) && mode !== "funda") setMode("funda");
  }, [mode, query]);

  useEffect(() => {
    dismissedRef.current = false;
    setResults([]);
    setActiveIndex(-1);
    setError("");

    if (fundaMode || query.trim().length < 3) {
      setSearching(false);
      setSearched(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/address/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const body = await response.json() as { results?: AddressSearchResult[]; error?: string };
        if (requestId !== requestIdRef.current || dismissedRef.current) return;
        if (!response.ok) throw new Error(body.error ?? "Zoeken lukt nu niet");
        setResults(body.results ?? []);
        setError("");
        setSearched(true);
        setActiveIndex(-1);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        if (requestId !== requestIdRef.current || dismissedRef.current) return;
        setError(caught instanceof Error ? caught.message : "Zoeken lukt nu niet");
        setResults([]);
        setSearched(true);
      } finally {
        if (requestId === requestIdRef.current) setSearching(false);
      }
    }, 260);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fundaMode, query]);

  function openResult(result: AddressSearchResult) {
    if (onSelect) onSelect(result);
    else router.push(`/woning/${encodeURIComponent(result.bagVboId)}`);
  }

  async function openFundaListing(sourceUrl: string) {
    setSearching(true);
    setError("");
    try {
      const response = await fetch("/api/listing/from-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceUrl }),
      });
      const body = await response.json() as FromUrlResponse;
      if (!response.ok || !body.address) {
        setError(body.error ?? "Deze Funda-link kon niet worden ingelezen.");
        return;
      }
      const notice = body.blocked
        ? "Funda vroeg om een mensen-check. Plak kenmerken of pagina-HTML bij Funda-link."
        : undefined;
      storeDraft(body.address.bagVboId, sourceUrl, body.listing, body.facts, body.blocked, notice);
      openResult(body.address);
    } catch {
      setError("Geen verbinding. Controleer je netwerk en probeer het opnieuw.");
    } finally {
      setSearching(false);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      dismissedRef.current = true;
      requestIdRef.current += 1;
      setActiveIndex(-1);
      setResults([]);
      setSearching(false);
      return;
    }

    if (fundaMode) {
      if (event.key === "Enter") {
        event.preventDefault();
        if (!searching && isFundaListingUrl(query)) void openFundaListing(query.trim());
      }
      return;
    }

    if (!results.length || dismissedRef.current) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? results.length - 1 : index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (dismissedRef.current || !results.length) return;
      const pick = activeIndex >= 0 ? results[activeIndex] : results[0];
      if (pick) openResult(pick);
    }
  }

  const showEmpty = !fundaMode && searched && !searching && !error && query.trim().length >= 3 && results.length === 0;
  const activeId = activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  return (
    <div className="search-wrap" id={id}>
      <div className="search-mode" role="radiogroup" aria-label="Zoekmodus">
        <button
          type="button"
          role="radio"
          className={mode === "adres" && !isFundaListingUrl(query) ? "search-mode-tab selected" : "search-mode-tab"}
          aria-checked={mode === "adres" && !isFundaListingUrl(query)}
          onClick={() => {
            setQuery("");
            setMode("adres");
          }}
        >
          <MapPin size={13} /> Adres
        </button>
        <button
          type="button"
          role="radio"
          className={fundaMode ? "search-mode-tab selected" : "search-mode-tab"}
          aria-checked={fundaMode}
          onClick={() => setMode("funda")}
        >
          <Link2 size={13} /> Funda-link
        </button>
      </div>
      <label className="search-field-label" htmlFor={`${id}-input`}>{fundaMode ? "Funda-advertentielink" : "Adres"}</label>
      <form
        className="search-box"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (searching) return;
          if (fundaMode) {
            if (isFundaListingUrl(query)) void openFundaListing(query.trim());
            else setError("Plak de link van één Funda-woning, geen zoekresultaat.");
            return;
          }
          if (dismissedRef.current || !results.length) return;
          const pick = activeIndex >= 0 ? results[activeIndex] : results[0];
          if (pick) openResult(pick);
        }}
      >
        {fundaMode ? <Link2 size={19} aria-hidden="true" /> : <Search size={19} aria-hidden="true" />}
        <input
          ref={inputRef}
          id={`${id}-input`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={fundaMode ? "https://www.funda.nl/detail/koop/…" : "Bijv. Korenstraat 18, Epe"}
          aria-label={fundaMode ? "Plak een Funda-advertentielink" : "Zoek een Nederlands adres"}
          aria-autocomplete={fundaMode ? "none" : "list"}
          aria-controls={fundaMode ? undefined : listboxId}
          aria-expanded={!fundaMode && results.length > 0}
          aria-activedescendant={fundaMode ? undefined : activeId}
          role={fundaMode ? "searchbox" : "combobox"}
          autoComplete={fundaMode ? "url" : "street-address"}
          inputMode={fundaMode ? "url" : "text"}
        />
        <button className="search-button" type="submit" disabled={searching}>
          {searching ? (fundaMode ? "Inlezen…" : "Zoeken…") : (fundaMode ? "Haal woning op" : submitLabel)}
        </button>
      </form>
      {!fundaMode && results.length > 0 && (
        <div className="suggestions" role="listbox" id={listboxId} aria-label="Gevonden adressen">
          {results.map((result, index) => (
            <button
              type="button"
              className="suggestion"
              role="option"
              id={`${listboxId}-option-${index}`}
              key={result.id}
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => openResult(result)}
            >
              <span className="suggestion-icon" aria-hidden="true"><MapPin size={15} /></span>
              <span className="suggestion-text">
                <span>{result.displayName}</span>
                <small>Officieel adres</small>
              </span>
            </button>
          ))}
        </div>
      )}
      {error && <div className="search-hint" role="alert">{error}</div>}
      {showEmpty && (
        <div className="search-empty" role="status">
          Geen adres gevonden. Probeer straat + huisnummer + plaats, of plak een Funda-link.
        </div>
      )}
      <div className="search-hint">
        <Sparkles size={13} aria-hidden="true" /> {fundaMode ? "We lezen de advertentiepagina in en zoeken het officiële BAG-adres." : (
          <>
            Probeer ook{" "}
            <span>een echt Nederlands adres</span>
            {quickAddresses.map((address) => (
              <button type="button" className="quick-address" key={address} onClick={() => { setMode("adres"); setQuery(address); }}>
                {address}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
