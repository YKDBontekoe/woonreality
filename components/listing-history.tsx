"use client";

import { ArrowRight, ExternalLink, GitCompare, Heart, Puzzle, Trash2 } from "lucide-react";
import Link from "next/link";
import { formatCapturedAt, type ListingHistoryItem } from "@/src/lib/listing-history";
import { formatEuro } from "@/src/lib/purchase";
import { EmptyState } from "@/components/ui/empty-state";
import type { WorkspaceAuthStatus } from "@/components/use-property-workspace";
import { usePropertyWorkspace } from "@/components/use-property-workspace";
import type { WorkspaceData } from "@/src/lib/workspace";

type ListingHistoryProps = {
  compact?: boolean;
  workspace: WorkspaceData;
  workspaceReady: boolean;
  authStatus: WorkspaceAuthStatus;
  toggleCompare: (bagVboId: string) => void | Promise<unknown>;
  saveHistoryItem: (item: ListingHistoryItem) => Promise<unknown>;
  removeListingHistory: (bagVboId: string) => Promise<unknown>;
};

export function ListingHistoryFromWorkspace({ compact = false }: { compact?: boolean }) {
  const {
    workspace,
    workspaceReady,
    authStatus,
    toggleCompare,
    saveHistoryItem,
    removeListingHistory,
  } = usePropertyWorkspace();
  return (
    <ListingHistory
      compact={compact}
      workspace={workspace}
      workspaceReady={workspaceReady}
      authStatus={authStatus}
      toggleCompare={toggleCompare}
      saveHistoryItem={saveHistoryItem}
      removeListingHistory={removeListingHistory}
    />
  );
}

export function ListingHistory({
  compact = false,
  workspace,
  workspaceReady,
  authStatus,
  toggleCompare,
  saveHistoryItem,
  removeListingHistory,
}: ListingHistoryProps) {
  const items = workspace.listingHistory;
  const savedIds = new Set(workspace.saved.map((item) => item.bagVboId));
  const compareCount = workspace.compare.length;
  const compareFull = compareCount >= 4;

  if (!workspaceReady) {
    return compact ? null : <div className="loading-block" aria-hidden="true" />;
  }

  if (authStatus === "anonymous") {
    return (
      <EmptyState
        icon={<Puzzle size={20} />}
        title="Log in om Funda-geschiedenis te zien"
        text="Gekoppelde advertenties landen in je account. Daarna kun je ze hier terugvinden en naast elkaar vergelijken."
        action={<Link className="primary-button" href="/login">Inloggen</Link>}
      />
    );
  }

  return (
    <div className={compact ? "listing-history listing-history-compact" : "listing-history"}>
      {!compact && (
        <div className="section-inline-heading">
          <div>
            <div className="eyebrow"><Puzzle size={13} /> bekeken via Funda</div>
            <h2>Advertenties die jij opende</h2>
            <p>Elke Funda-pagina die de extensie of een geplakte link vastlegde. Vink er tot vier aan om ze te vergelijken.</p>
          </div>
          <Link className="secondary-button" href="/extensie"><Puzzle size={14} /> Extensie</Link>
        </div>
      )}
      {compact && (
        <div className="section-inline-heading">
          <div>
            <h2>Bekeken advertenties</h2>
            <p>Woningen die deze gekoppelde browser heeft vastgelegd. Selecteer er twee tot vier om te vergelijken.</p>
          </div>
        </div>
      )}

      {compareCount > 0 && items.length > 0 && (
        <div className="compare-banner">
          <span>
            <GitCompare size={15} /> {compareCount} {compareCount === 1 ? "woning" : "woningen"} geselecteerd om te vergelijken
          </span>
          {compareCount >= 2 ? (
            <Link className="primary-button" href={`/vergelijken?ids=${workspace.compare.join(",")}`}>
              Open vergelijking
            </Link>
          ) : (
            <span className="muted-copy">Kies nog een woning</span>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<Puzzle size={20} />}
          title="Nog geen Funda-advertenties"
          text="Open een advertentie in je browser met de gekoppelde extensie, of plak een Funda-link bij zoeken. Kenmerken verschijnen hier automatisch."
          action={compact ? undefined : <Link className="primary-button" href="/extensie">Koppel de extensie <ArrowRight size={14} /></Link>}
        />
      ) : (
        <div className="listing-history-board">
          {items.map((item) => {
            const selected = workspace.compare.includes(item.bagVboId);
            const saved = savedIds.has(item.bagVboId);
            const rooms = item.roomCount != null
              ? `${item.roomCount} kamers`
              : item.bedroomCount != null
                ? `${item.bedroomCount} slaapkamers`
                : null;
            return (
              <article className={`listing-history-card${selected ? " is-selected" : ""}`} key={item.bagVboId}>
                <label className="listing-history-check">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={!selected && compareFull}
                    onChange={() => { void toggleCompare(item.bagVboId); }}
                    aria-label={`${selected ? "Haal" : "Zet"} ${item.addressLabel} ${selected ? "uit" : "in"} de vergelijking`}
                  />
                  <span>Vergelijken</span>
                </label>
                <div className="home-card-address">
                  <div>
                    <h3>{item.addressLabel}</h3>
                    <span>{[item.postcode, item.city].filter(Boolean).join(" ") || "Adres uit Funda-link"}</span>
                  </div>
                </div>
                <strong className="listing-history-price">{formatEuro(item.askingPrice)}</strong>
                <div className="home-card-meta">
                  {item.livingAreaM2 != null ? <span>{item.livingAreaM2} m²</span> : null}
                  {rooms ? <span>{rooms}</span> : null}
                  {item.energyLabel ? <span>Label {item.energyLabel}</span> : null}
                  <span>{formatCapturedAt(item.capturedAt)}</span>
                </div>
                <div className="listing-history-actions">
                  <Link className="text-link listing-history-link" href={`/woning/${item.bagVboId}`}>
                    Open check <ArrowRight size={13} />
                  </Link>
                  <a className="text-link listing-history-link" href={item.sourceUrl} target="_blank" rel="noreferrer">
                    Funda <ExternalLink size={13} />
                  </a>
                  {saved ? (
                    <span className="listing-history-saved"><Heart size={13} fill="currentColor" /> Bewaard</span>
                  ) : (
                    <button className="text-link listing-history-link" type="button" onClick={() => { void saveHistoryItem(item); }}>
                      <Heart size={13} /> Bewaar
                    </button>
                  )}
                  <button
                    className="text-link listing-history-link listing-history-remove"
                    type="button"
                    aria-label={`Verwijder ${item.addressLabel} uit je advertentiegeschiedenis`}
                    onClick={() => {
                      if (!window.confirm(`Verwijder ${item.addressLabel} uit je advertentiegeschiedenis?`)) return;
                      void removeListingHistory(item.bagVboId);
                    }}
                  >
                    <Trash2 size={13} /> Verwijder
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
