"use client";

import { Link2, Puzzle, RefreshCw } from "lucide-react";
import { Link } from "@/src/lib/i18n/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { isFundaListingUrl, type ImportedListingFacts } from "@/src/lib/listing-import";
import { readListingDraft, writeListingDraft } from "@/src/lib/listing-draft";
import { apiFetch } from "@/components/hooks/use-api";
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
  // Without a fresh notice an unblocked re-import must clear the stale one.
  void writeListingDraft(bagId, {
    sourceUrl,
    askingPrice: listing.askingPrice,
    facts,
    blocked,
    notice,
  }, blocked ? {} : { resetKeys: ["notice"] });
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
    const draft = readListingDraft(bagId);
    if (draft?.notice) setMessage(draft.notice);
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
      const result = await apiFetch<ImportResponse>(`/api/listing/user/${encodeURIComponent(bagId)}/import`, {
        method: "POST",
        json: { sourceUrl: url },
      });
      if (!result.ok) {
        setMessage(result.data?.error ?? result.error ?? t("funda.linkFailed"));
        return;
      }
      if (result.data?.listing) {
        onListingChange(result.data.listing);
        const notice = t("funda.savedNotice");
        storeDraft(bagId, url, result.data.listing, result.data.facts, result.data.blocked, notice);
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
