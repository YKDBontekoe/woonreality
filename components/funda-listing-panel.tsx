"use client";

import { Link2, Puzzle, RefreshCw } from "lucide-react";
import { Link } from "@/src/lib/i18n/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { listingStorageKey, type UserListingDraft } from "@/src/lib/listing-intake";
import { isFundaListingUrl, type ImportedListingFacts } from "@/src/lib/listing-import";
import type { PropertyListing } from "@/src/lib/types";

type ImportResponse = {
  listing?: PropertyListing | null;
  facts?: ImportedListingFacts;
  blocked?: boolean;
  persisted?: boolean;
  error?: string;
};

function storeDraft(
  bagId: string,
  sourceUrl: string,
  listing: PropertyListing,
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
    askingPrice: listing.askingPrice ?? existing?.askingPrice,
    sourceUrl,
    facts: facts ?? existing?.facts,
    blocked: blocked ?? existing?.blocked,
    notice: notice ?? (blocked ? existing?.notice : undefined),
  };
  try {
    sessionStorage.setItem(listingStorageKey(bagId), JSON.stringify(draft));
  } catch { /* private mode */ }
}

export function FundaListingPanel({
  bagId,
  listing,
  onListingChange,
}: {
  bagId: string;
  listing: PropertyListing | null;
  onListingChange: (listing: PropertyListing | null) => void;
}) {
  const t = useTranslations("woning");
  const [sourceUrl, setSourceUrl] = useState(isFundaListingUrl(listing?.sourceUrl ?? "") ? listing?.sourceUrl ?? "" : "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const sourceUrlTouchedRef = useRef(false);

  useEffect(() => {
    if (sourceUrlTouchedRef.current) return;
    if (isFundaListingUrl(listing?.sourceUrl ?? "")) setSourceUrl(listing?.sourceUrl ?? "");
  }, [listing?.sourceUrl]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(listingStorageKey(bagId));
      const draft = raw ? JSON.parse(raw) as UserListingDraft : null;
      if (draft?.notice) setMessage(draft.notice);
    } catch { /* private mode */ }
  }, [bagId]);

  async function importListing() {
    const url = sourceUrl.trim();
    if (!isFundaListingUrl(url)) {
      setMessage(t("funda.invalidUrl"));
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/listing/user/${encodeURIComponent(bagId)}/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceUrl: url }),
      });
      const body = await response.json() as ImportResponse;
      if (!response.ok) {
        setMessage(body.error ?? t("funda.linkFailed"));
        return;
      }
      if (body.listing) {
        onListingChange(body.listing);
        const notice = t("funda.savedNotice");
        storeDraft(bagId, url, body.listing, body.facts, body.blocked, notice);
        setMessage(notice);
      }
    } catch {
      setMessage(t("networkError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="funda-listing-panel funda-listing-panel-compact" id="advertentie">
      <div className="section-inline-heading">
        <div>
          <div className="eyebrow"><Link2 size={13} /> {t("funda.missingEyebrow")}</div>
          <h2>{t("funda.heading")}</h2>
          <p>
            {t("funda.bodyPrefix")}{" "}
            <Link href="/extensie">{t("funda.extensionLink")}</Link>{t("funda.bodySuffix")}
          </p>
        </div>
      </div>
      <div className="listing-intake-card funda-listing-form">
        <label>
          {t("funda.linkLabel")}
          <input
            type="url"
            value={sourceUrl}
            onChange={(event) => {
              sourceUrlTouchedRef.current = true;
              setSourceUrl(event.target.value);
            }}
            placeholder="https://www.funda.nl/detail/koop/…"
            inputMode="url"
            autoComplete="url"
          />
        </label>
        <div className="funda-listing-actions">
          <button className="primary-button" type="button" disabled={busy || !sourceUrl.trim()} onClick={() => { void importListing(); }}>
            {busy ? <RefreshCw size={14} className="spin" /> : <Link2 size={14} />}
            {busy ? t("funda.linking") : t("funda.linkButton")}
          </button>
          <Link className="secondary-button" href="/extensie">
            <Puzzle size={14} /> {t("funda.installExtension")}
          </Link>
        </div>
        {message && <p className="form-message" role="status">{message}</p>}
      </div>
    </section>
  );
}
