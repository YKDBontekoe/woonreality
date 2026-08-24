"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/src/lib/i18n/navigation";
import { AddressSearch } from "@/components/address-search";
import { listingStorageKey, type UserListingDraft } from "@/src/lib/listing-intake";
import { isFundaListingUrl, type ImportedListingFacts } from "@/src/lib/listing-import";
import type { AddressSearchResult } from "@/src/lib/types";

export function ListingIntake() {
  const t = useTranslations("woning");
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
          notice = t("intake.followViaExtension");
          setMessage(notice);
        } else {
          notice = importBody.error ?? t("funda.linkFailed");
          setMessage(notice);
        }
      } catch {
        notice = t("intake.linkUnavailable");
        setMessage(notice);
      }
    } else if (url) {
      notice = t("intake.onlyFundaLinks");
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
        setMessage(t("intake.savedLocally"));
        setAuthContinue(true);
        setBusy(false);
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: undefined })) as { error?: string };
        if (response.status === 400) setMessage(body.error ?? t("intake.checkInput"));
        else if (response.status === 502) setMessage(body.error ?? t("intake.saveRetry"));
        else setMessage(body.error ?? t("intake.saveFailed"));
        setBusy(false);
        return;
      }
      goToProperty(result.bagVboId);
    } catch {
      setMessage(t("networkError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="listing-intake">
      <button className="text-link" type="button" onClick={() => setOpen((value) => !value)}>
        {open ? t("intake.hideToggle") : t("intake.showToggle")}
      </button>
      {open && (
        <div className="listing-intake-card">
          <p>
            {t("intake.bodyPrefix")}{" "}
            <Link href="/extensie">{t("intake.extensionLink")}</Link> {t("intake.bodySuffix")}
          </p>
          <AddressSearch id="advertentie-adres" submitLabel={t("intake.submitAddress")} onSelect={setSelected} addressesOnly />
          {selected && <small className="listing-selected">{t("intake.linkedAddress", { name: selected.displayName })}</small>}
          <div className="listing-intake-grid">
            <label>{t("intake.askingPriceOptional")}<input type="number" inputMode="numeric" min="0" step="500" value={askingPrice} onChange={(event) => setAskingPrice(event.target.value)} placeholder="555000" /></label>
            <label>{t("intake.fundaLink")}<input type="url" inputMode="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://www.funda.nl/detail/koop/…" /></label>
          </div>
          {message && <p className="form-message" role="status">{message}</p>}
          {authContinue && selected && (
            <button className="secondary-button" type="button" onClick={() => goToProperty(selected.bagVboId)}>
              {t("intake.continueAnyway")}
            </button>
          )}
          <button className="primary-button" type="button" disabled={!selected || busy} onClick={() => { if (selected) void continueWith(selected); }}>
            {busy ? t("intake.saving") : t("intake.startCheck")}
          </button>
        </div>
      )}
    </div>
  );
}
