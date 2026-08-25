"use client";

import { BellOff, History, MapPin } from "lucide-react";
import { Link } from "@/src/lib/i18n/navigation";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/components/hooks/use-api";
import { formatScore } from "@/src/lib/math";
import type { Analysis } from "@/src/lib/types";
import { watchAlertHash, type WatchChange } from "@/src/lib/watch";

type WatchedHome = {
  bagVboId: string;
  addressLabel: string;
  since: string | null;
  overallFrom: number | null;
  changes: WatchChange[];
};

type WatchesResponse = {
  checkedAt: string;
  watches: WatchedHome[];
};

const SEEN_STORAGE_KEY = "woonreality.watch.seen";

function readSeenHashes(): string[] {
  try {
    const raw = window.localStorage.getItem(SEEN_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeSeenHashes(hashes: string[]) {
  try {
    window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(hashes.slice(-200)));
  } catch {
    // Private browsing: alerts simply reappear next visit.
  }
}

function formatDate(value: string | null, locale: string) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(parsed);
}

export function WatchAlerts({
  analyses,
  authenticated,
}: {
  analyses: Record<string, Analysis>;
  authenticated: boolean;
}) {
  const t = useTranslations("mijn-aankoop");
  const locale = useLocale();
  const [watches, setWatches] = useState<WatchedHome[]>([]);
  const [seenHashes, setSeenHashes] = useState<string[]>([]);
  const analysesKey = Object.keys(analyses).sort().join("|");
  const payload = useMemo(() => JSON.stringify({ analyses }), [analyses]);

  useEffect(() => {
    if (!authenticated || !analysesKey) return;
    let active = true;
    apiFetch<WatchesResponse>("/api/watches/alerts", { method: "POST", json: JSON.parse(payload) })
      .then((result) => {
        if (!active) return;
        setWatches(result.ok && result.data ? result.data.watches.filter((watch) => watch.changes.length > 0) : []);
        setSeenHashes(readSeenHashes());
      })
      .catch(() => {
        // Monitoring is best-effort; the cockpit works without it.
      });
    return () => { active = false; };
  }, [authenticated, analysesKey, payload]);

  function dismiss(watch: WatchedHome) {
    const hashes = [...new Set([...readSeenHashes(), ...watch.changes.map((change) => watchAlertHash(watch.bagVboId, change))])];
    writeSeenHashes(hashes);
    setSeenHashes(hashes);
  }

  const visible = watches.filter((watch) => watch.changes.some((change) => !seenHashes.includes(watchAlertHash(watch.bagVboId, change))));
  if (!visible.length) return null;

  return (
    <section className="cockpit-section watch-section" id="bewaking" aria-label={t("watch.aria")}>
      <div className="section-inline-heading">
        <div>
          <div className="eyebrow"><History size={13} /> {t("watch.kicker")}</div>
          <h2>{t("watch.title")}</h2>
          <p>{t("watch.copy")}</p>
        </div>
      </div>
      <div className="watch-grid">
        {visible.map((watch) => (
          <article className="watch-card" key={watch.bagVboId}>
            <div className="watch-card-heading">
              <span className="home-card-icon"><MapPin size={15} /></span>
              <div>
                <h3>{watch.addressLabel.split(",")[0]}</h3>
                {watch.since && <small>{t("watch.since", { date: formatDate(watch.since, locale) ?? watch.since })}</small>}
              </div>
              <button className="icon-button" type="button" aria-label={t("watch.dismissAria")} onClick={() => dismiss(watch)}><BellOff size={14} /></button>
            </div>
            <ul className="watch-changes">
              {watch.changes.map((change) => {
                const hash = watchAlertHash(watch.bagVboId, change);
                if (seenHashes.includes(hash)) return null;
                return (
                  <li key={hash}>
                    <strong>{change.label}</strong>
                    <span className="watch-delta">
                      {formatScore(change.from)} → {formatScore(change.to)}
                    </span>
                  </li>
                );
              })}
            </ul>
            <Link className="text-link" href={`/woning/${watch.bagVboId}`}>{t("watch.openCheck")}</Link>
          </article>
        ))}
      </div>
      <p className="watch-note">{t("watch.note")}<button className="text-link" type="button" onClick={() => { for (const watch of visible) dismiss(watch); }}><BellOff size={12} /> {t("watch.dismissAll")}</button></p>
    </section>
  );
}
