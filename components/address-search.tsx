"use client";

import { Building2, Home, Link2, MapPin, Search, Sparkles } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { listingStorageKey, type UserListingDraft } from "@/src/lib/listing-intake";
import { isFundaListingUrl, type ImportedListingFacts } from "@/src/lib/listing-import";
import type { AddressSearchResult, LocationSearchResult, PropertyListing } from "@/src/lib/types";
import { loginHref } from "@/src/lib/login-href";

function addressSuggestionSubtitle(displayName: string) {
  const parts = displayName.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return parts.slice(1).join(", ");
  return "Nederland";
}

function locationKindLabel(kind: LocationSearchResult["kind"]) {
  if (kind === "adres") return "Adres";
  if (kind === "woonplaats") return "Woonplaats";
  if (kind === "gemeente") return "Gemeente";
  return "Buurt";
}

function suggestionSubtitle(result: LocationSearchResult) {
  if (result.kind === "adres") return addressSuggestionSubtitle(result.displayName);
  return result.subtitle ?? locationKindLabel(result.kind);
}

function suggestionIcon(result: LocationSearchResult) {
  if (result.kind === "adres") return <MapPin size={15} />;
  if (result.kind === "woonplaats") return <Home size={15} />;
  if (result.kind === "gemeente") return <Building2 size={15} />;
  return <MapPin size={15} />;
}

const quickExamples = [
  { label: "Korenstraat 18, Epe", requireAddress: true },
  { label: "Epe", requireAddress: false },
  { label: "Amsterdam", requireAddress: false },
];

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
  submitLabel = "Check adres",
  id = "zoek-adres",
  initialQuery = "",
  addressesOnly = false,
}: {
  onSelect?: (result: AddressSearchResult) => void;
  submitLabel?: string;
  id?: string;
  initialQuery?: string;
  addressesOnly?: boolean;
}) {
  const router = useRouter();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const modeButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const requestIdRef = useRef(0);
  const directAddressRef = useRef<string | null>(null);
  const dismissedRef = useRef(false);
  const [mode, setMode] = useState<SearchMode>("adres");
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<LocationSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searched, setSearched] = useState(false);

  const addressesOnlyParam = addressesOnly ? "&addressesOnly=1" : "";

  const fundaMode = !addressesOnly && (mode === "funda" || isFundaListingUrl(query));
  const visibleResults = addressesOnly ? results.filter((result) => result.kind === "adres") : results;

  function selectMode(nextMode: SearchMode) {
    setQuery("");
    setMode(nextMode);
  }

  function handleModeKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + 2) % 2;
    const nextMode: SearchMode = nextIndex === 0 ? "adres" : "funda";
    selectMode(nextMode);
    modeButtonRefs.current[nextIndex]?.focus();
  }

  useEffect(() => {
    if (addressesOnly) return;
    if (isFundaListingUrl(query) && mode !== "funda") setMode("funda");
  }, [addressesOnly, mode, query]);

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

    if (directAddressRef.current === query) {
      directAddressRef.current = null;
      return;
    }

    const requestId = ++requestIdRef.current;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/address/search?q=${encodeURIComponent(query)}${addressesOnlyParam}`, { signal: controller.signal });
        if (response.status === 401) { window.location.href = loginHref(); return; }
        const body = await response.json() as { results?: LocationSearchResult[]; error?: string };
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
  }, [addressesOnlyParam, fundaMode, query]);

  function openResult(result: LocationSearchResult) {
    if (result.kind !== "adres") {
      if (addressesOnly) return;
      router.push(`/plek/${result.kind}/${encodeURIComponent(result.code)}`);
      return;
    }
    if (onSelect) onSelect(result);
    else router.push(`/woning/${encodeURIComponent(result.bagVboId)}`);
  }

  async function openQuickExample(example: string, requireAddress: boolean) {
    directAddressRef.current = example;
    dismissedRef.current = false;
    setMode("adres");
    setQuery(example);
    setResults([]);
    setError("");
    setSearched(false);
    setSearching(true);
    try {
      const response = await fetch(`/api/address/search?q=${encodeURIComponent(example)}${addressesOnlyParam}`);
      if (response.status === 401) { window.location.href = loginHref(); return; }
      const body = await response.json() as { results?: LocationSearchResult[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Zoeken lukt nu niet");
      const result = requireAddress || addressesOnly
        ? body.results?.find((item) => item.kind === "adres")
        : body.results?.[0];
      if (!result) throw new Error("Dit voorbeeld is nu niet beschikbaar. Probeer het later opnieuw.");
      openResult(result);
    } catch (caught) {
      directAddressRef.current = null;
      setError(caught instanceof Error ? caught.message : "Zoeken lukt nu niet");
      setSearched(true);
    } finally {
      setSearching(false);
    }
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
      if (response.status === 401) { window.location.href = loginHref(); return; }
      const body = await response.json() as FromUrlResponse;
      if (!response.ok || !body.address) {
        setError(body.error ?? "Deze Funda-link kon niet worden ingelezen.");
        return;
      }
      const notice = body.blocked
        ? "Adres uit de Funda-link gevonden. Open de advertentie met de WoonReality-extensie voor kenmerken."
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

    if (!visibleResults.length || dismissedRef.current) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % visibleResults.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? visibleResults.length - 1 : index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (dismissedRef.current || !visibleResults.length) return;
      const pick = activeIndex >= 0 ? visibleResults[activeIndex] : visibleResults[0];
      if (pick) openResult(pick);
    }
  }

  const showEmpty = !fundaMode && searched && !searching && !error && query.trim().length >= 3 && visibleResults.length === 0;
  const activeId = activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  return (
    <div className="search-wrap" id={id}>
      {!addressesOnly && (
        <div className="search-mode" role="radiogroup" aria-label="Zoekmodus">
          <button
            type="button"
            role="radio"
            className={mode === "adres" && !isFundaListingUrl(query) ? "search-mode-tab selected" : "search-mode-tab"}
            aria-checked={mode === "adres" && !isFundaListingUrl(query)}
            ref={(node) => { modeButtonRefs.current[0] = node; }}
            onClick={() => selectMode("adres")}
            onKeyDown={(event) => handleModeKeyDown(event, 0)}
          >
            <MapPin size={13} /> Adres
          </button>
          <button
            type="button"
            role="radio"
            className={fundaMode ? "search-mode-tab selected" : "search-mode-tab"}
            aria-checked={fundaMode}
            ref={(node) => { modeButtonRefs.current[1] = node; }}
            onClick={() => selectMode("funda")}
            onKeyDown={(event) => handleModeKeyDown(event, 1)}
          >
            <Link2 size={13} /> Funda-link
          </button>
        </div>
      )}
      <label className="search-field-label" htmlFor={`${id}-input`}>
        {fundaMode ? "Funda-advertentielink" : addressesOnly ? "Adres in deze plek" : "Adres, buurt of plaats"}
      </label>
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
          if (dismissedRef.current || !visibleResults.length) {
            setError(query.trim().length < 3
              ? "Vul minimaal drie tekens in."
              : addressesOnly
                ? "Kies een adres uit de lijst."
                : "Kies een adres, buurt of plaats uit de lijst.");
            return;
          }
          const pick = activeIndex >= 0 ? visibleResults[activeIndex] : visibleResults[0];
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
          placeholder={fundaMode ? "https://www.funda.nl/detail/koop/…" : "Bijv. Amsterdam, Jordaan of Korenstraat 18, Epe"}
          aria-label={fundaMode ? "Plak een Funda-advertentielink" : "Zoek een adres, buurt of plaats"}
          aria-autocomplete={fundaMode ? "none" : "list"}
          aria-controls={fundaMode ? undefined : listboxId}
          aria-expanded={!fundaMode && visibleResults.length > 0}
          aria-activedescendant={fundaMode ? undefined : activeId}
          role={fundaMode ? "searchbox" : "combobox"}
          autoComplete={fundaMode ? "url" : "street-address"}
          inputMode={fundaMode ? "url" : "text"}
        />
        <button className="search-button" type="submit" disabled={searching}>
          {searching ? (fundaMode ? "Inlezen…" : "Zoeken…") : (fundaMode ? "Haal woning op" : submitLabel)}
        </button>
      </form>
      {!fundaMode && visibleResults.length > 0 && (
        <div className="suggestions" role="listbox" id={listboxId} aria-label="Gevonden locaties">
          {visibleResults.map((result, index) => (
            <button
              type="button"
              className="suggestion"
              role="option"
              id={`${listboxId}-option-${index}`}
              key={`${result.kind}-${result.kind === "adres" ? result.bagVboId : result.code}`}
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => openResult(result)}
            >
              <span className="suggestion-icon" aria-hidden="true">{suggestionIcon(result)}</span>
              <span className="suggestion-text">
                <span>{result.displayName}</span>
                <small>{suggestionSubtitle(result)}</small>
              </span>
              <span className="suggestion-kind">{locationKindLabel(result.kind)}</span>
            </button>
          ))}
        </div>
      )}
      {searching && !fundaMode && (
        <div className="search-loading" role="status" aria-live="polite">
          <span className="sr-only">Locaties zoeken…</span>
          <span className="search-loading-icon" aria-hidden="true" />
          <span className="search-loading-copy" aria-hidden="true">
            <span className="search-skeleton-line search-skeleton-line-title" />
            <span className="search-skeleton-line search-skeleton-line-detail" />
          </span>
        </div>
      )}
      {error && <div className="search-hint" role="alert">{error}</div>}
      {showEmpty && (
        <div className="search-empty" role="status">
          {addressesOnly
            ? "Geen adres gevonden. Probeer straat + huisnummer + plaats."
            : "Geen resultaat gevonden. Probeer een plaats, buurt of straat + huisnummer + plaats."}
        </div>
      )}
      {!addressesOnly && (
        <div className="search-hint">
          <Sparkles size={13} aria-hidden="true" /> {fundaMode ? "We zoeken het officiële BAG-adres uit de link. Kenmerken komen uit de extensie." : (
            <>
              Probeer ook{" "}
              {quickExamples.map((example) => (
                <button
                  type="button"
                  className="quick-address"
                  key={example.label}
                  onClick={() => { void openQuickExample(example.label, example.requireAddress); }}
                >
                  {example.label}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
