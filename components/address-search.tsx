"use client";

import { MapPin, Search, Sparkles } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AddressSearchResult } from "@/src/lib/types";

const quickAddresses = ["Korenstraat 18, Epe", "Witte de Withstraat 42, Rotterdam", "Biltstraat 65, Utrecht"];

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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddressSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    dismissedRef.current = false;
    setResults([]);
    setActiveIndex(-1);
    setError("");

    if (query.trim().length < 3) {
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
  }, [query]);

  function openResult(result: AddressSearchResult) {
    if (onSelect) onSelect(result);
    else router.push(`/woning/${encodeURIComponent(result.bagVboId)}`);
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

  const showEmpty = searched && !searching && !error && query.trim().length >= 3 && results.length === 0;
  const activeId = activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  return (
    <div className="search-wrap" id={id}>
      <label className="search-field-label" htmlFor={`${id}-input`}>Adres</label>
      <form
        className="search-box"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (dismissedRef.current || !results.length) return;
          const pick = activeIndex >= 0 ? results[activeIndex] : results[0];
          if (pick) openResult(pick);
        }}
      >
        <Search size={19} aria-hidden="true" />
        <input
          ref={inputRef}
          id={`${id}-input`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Bijv. Korenstraat 18, Epe"
          aria-label="Zoek een Nederlands adres"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={results.length > 0}
          aria-activedescendant={activeId}
          role="combobox"
          autoComplete="street-address"
        />
        <button className="search-button" type="submit">{searching ? "Zoeken…" : submitLabel}</button>
      </form>
      {results.length > 0 && (
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
          Geen adres gevonden. Probeer straat + huisnummer + plaats.
        </div>
      )}
      <div className="search-hint">
        <Sparkles size={13} aria-hidden="true" /> Probeer ook{" "}
        <span>een echt Nederlands adres</span>
        {quickAddresses.map((address) => (
          <button type="button" className="quick-address" key={address} onClick={() => setQuery(address)}>
            {address}
          </button>
        ))}
      </div>
    </div>
  );
}
