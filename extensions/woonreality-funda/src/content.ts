import { extractFundaListingFromDocument, isFundaChallengeDocument } from "@/src/lib/listing-extract-dom";
import { PARSER_VERSION, listingFactsAreSparse, normalizeFundaListingUrl } from "@/src/lib/listing-extract";

let lastHref = "";
let attempts = 0;
let timer = 0;

function showChip(text: string, tone: "ok" | "warn" = "ok") {
  const existing = document.getElementById("woonreality-funda-chip");
  existing?.remove();
  const chip = document.createElement("div");
  chip.id = "woonreality-funda-chip";
  chip.textContent = text;
  chip.style.cssText = [
    "position:fixed", "z-index:2147483647", "right:16px", "bottom:16px",
    "font:13px/1.3 system-ui,sans-serif", "padding:10px 12px", "border-radius:10px",
    "box-shadow:0 8px 24px rgba(15,23,42,.18)", "max-width:280px",
    tone === "ok" ? "background:#0f766e;color:#fff" : "background:#f59e0b;color:#111",
  ].join(";");
  document.documentElement.appendChild(chip);
  window.setTimeout(() => chip.remove(), 4000);
}

function capture(reason: "auto" | "manual" = "auto") {
  const sourceUrl = normalizeFundaListingUrl(location.href);
  if (!sourceUrl) return;
  if (isFundaChallengeDocument(document)) {
    chrome.runtime.sendMessage({ type: "listing-challenge", sourceUrl });
    if (reason === "manual") showChip("Funda vraagt om een mensen-check. Rond die eerst af.", "warn");
    return;
  }
  const facts = extractFundaListingFromDocument(document, sourceUrl);
  if (listingFactsAreSparse(facts)) {
    if (reason === "manual") showChip("Nog te weinig kenmerken op deze pagina.", "warn");
    return;
  }
  chrome.runtime.sendMessage({
    type: reason === "manual" ? "listing-save" : "listing-captured",
    payload: {
      sourceUrl,
      capturedAt: new Date().toISOString(),
      parserVersion: PARSER_VERSION,
      facts,
    },
  }, (response?: { ok?: boolean; error?: string; skipped?: boolean }) => {
    if (chrome.runtime.lastError) return;
    if (reason !== "manual") return;
    if (response?.ok) showChip("Opgeslagen in WoonReality");
    else if (response?.error) showChip(response.error, "warn");
  });
}

function schedule() {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    const href = location.href;
    if (href !== lastHref) {
      lastHref = href;
      attempts = 0;
    }
    const sourceUrl = normalizeFundaListingUrl(href);
    if (!sourceUrl) return;
    if (attempts >= 8) return;
    attempts += 1;
    capture("auto");
  }, 900);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "save-current") {
    capture("manual");
    sendResponse({ ok: true });
  }
  return false;
});

const observer = new MutationObserver(() => schedule());
observer.observe(document.documentElement, { childList: true, subtree: true });
schedule();
