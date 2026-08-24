"use client";

import { ArrowRight, ExternalLink, GitCompare, Heart, Puzzle, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/src/lib/i18n/navigation";
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
  const t = useTranslations("woning");
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
        title={t("history.loginTitle")}
        text={t("history.loginText")}
        action={<Link className="primary-button" href="/login">{t("logIn")}</Link>}
      />
    );
  }

  return (
    <div className={compact ? "listing-history listing-history-compact" : "listing-history"}>
      {!compact && (
        <div className="section-inline-heading">
          <div>
            <div className="eyebrow"><Puzzle size={13} /> {t("history.viewedEyebrow")}</div>
            <h2>{t("history.openedListings")}</h2>
            <p>{t("history.fullIntro")}</p>
          </div>
          <Link className="secondary-button" href="/extensie"><Puzzle size={14} /> {t("history.extension")}</Link>
        </div>
      )}
      {compact && (
        <div className="section-inline-heading">
          <div>
            <h2>{t("history.compactTitle")}</h2>
            <p>{t("history.compactIntro")}</p>
          </div>
        </div>
      )}

      {compareCount > 0 && items.length > 0 && (
        <div className="compare-banner">
          <span>
            <GitCompare size={15} /> {t("history.selectedForCompare", { count: compareCount })}
          </span>
          {compareCount >= 2 ? (
            <Link className="primary-button" href={`/vergelijken?ids=${workspace.compare.join(",")}`}>
              {t("openComparison")}
            </Link>
          ) : (
            <span className="muted-copy">{t("history.chooseAnother")}</span>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<Puzzle size={20} />}
          title={t("history.emptyTitle")}
          text={t("history.emptyText")}
          action={compact ? undefined : <Link className="primary-button" href="/extensie">{t("history.connectExtension")} <ArrowRight size={14} /></Link>}
        />
      ) : (
        <div className="listing-history-board">
          {items.map((item) => {
            const selected = workspace.compare.includes(item.bagVboId);
            const saved = savedIds.has(item.bagVboId);
            const rooms = item.roomCount != null
              ? t("history.roomsCount", { count: item.roomCount })
              : item.bedroomCount != null
                ? t("history.bedroomsCount", { count: item.bedroomCount })
                : null;
            return (
              <article className={`listing-history-card${selected ? " is-selected" : ""}`} key={item.bagVboId}>
                <label className="listing-history-check">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={!selected && compareFull}
                    onChange={() => { void toggleCompare(item.bagVboId); }}
                    aria-label={selected ? t("history.removeFromCompare", { address: item.addressLabel }) : t("history.addToCompare", { address: item.addressLabel })}
                  />
                  <span>{t("history.compareLabel")}</span>
                </label>
                <div className="home-card-address">
                  <div>
                    <h3>{item.addressLabel}</h3>
                    <span>{[item.postcode, item.city].filter(Boolean).join(" ") || t("history.addressFromFunda")}</span>
                  </div>
                </div>
                <strong className="listing-history-price">{formatEuro(item.askingPrice)}</strong>
                <div className="home-card-meta">
                  {item.livingAreaM2 != null ? <span>{item.livingAreaM2} m²</span> : null}
                  {rooms ? <span>{rooms}</span> : null}
                  {item.energyLabel ? <span>{t("history.energyLabelShort", { label: item.energyLabel })}</span> : null}
                  <span>{formatCapturedAt(item.capturedAt)}</span>
                </div>
                <div className="listing-history-actions">
                  <Link className="text-link listing-history-link" href={`/woning/${item.bagVboId}`}>
                    {t("openCheck")} <ArrowRight size={13} />
                  </Link>
                  <a className="text-link listing-history-link" href={item.sourceUrl} target="_blank" rel="noreferrer">
                    Funda <ExternalLink size={13} />
                  </a>
                  {saved ? (
                    <span className="listing-history-saved"><Heart size={13} fill="currentColor" /> {t("saved")}</span>
                  ) : (
                    <button className="text-link listing-history-link" type="button" onClick={() => { void saveHistoryItem(item); }}>
                      <Heart size={13} /> {t("save")}
                    </button>
                  )}
                  <button
                    className="text-link listing-history-link listing-history-remove"
                    type="button"
                    aria-label={t("history.removeAria", { address: item.addressLabel })}
                    onClick={() => {
                      if (!window.confirm(t("history.removeConfirm", { address: item.addressLabel }))) return;
                      void removeListingHistory(item.bagVboId);
                    }}
                  >
                    <Trash2 size={13} /> {t("history.remove")}
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
