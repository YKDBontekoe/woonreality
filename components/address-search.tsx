"use client";

import { MapPin, Search, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AddressSearchResult } from "@/src/lib/types";

const quickAddresses = ["Korenstraat 18, Epe", "Witte de Withstraat 42, Rotterdam", "Biltstraat 65, Utrecht"];

export function AddressSearch({ onSelect, submitLabel = "Bekijk adres", id = "zoek-adres" }: { onSelect?: (result: AddressSearchResult) => void; submitLabel?: string; id?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddressSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (query.trim().length < 3) { setResults([]); setError(""); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/address/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const body = await response.json() as { results?: AddressSearchResult[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Zoeken lukt nu niet");
        setResults(body.results ?? []);
        setError("");
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Zoeken lukt nu niet");
      } finally { setSearching(false); }
    }, 260);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  function openResult(result: AddressSearchResult) {
    if (onSelect) onSelect(result);
    else router.push(`/woning/${encodeURIComponent(result.bagVboId)}`);
  }

  return <div className="search-wrap" id={id}>
    <form className="search-box" onSubmit={(event) => { event.preventDefault(); if (results[0]) openResult(results[0]); }}>
      <Search size={19} />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Bijv. Korenstraat 18, Epe" aria-label="Zoek een Nederlands adres" />
      <button className="search-button" type="submit">{searching ? "Zoeken…" : submitLabel}</button>
    </form>
    {results.length > 0 && <div className="suggestions">{results.map((result) => <button type="button" className="suggestion" key={result.id} onClick={() => openResult(result)}><span className="suggestion-icon"><MapPin size={15} /></span><span className="suggestion-text"><span>{result.displayName}</span><small>BAG-adres gevonden · open data</small></span></button>)}</div>}
    {error && <div className="search-hint" role="alert">{error}</div>}
    <div className="search-hint"><Sparkles size={13} /> Probeer ook <span>een echt Nederlands adres</span>{quickAddresses.map((address) => <button type="button" className="quick-address" key={address} onClick={() => setQuery(address)}>{address}</button>)}</div>
  </div>;
}
