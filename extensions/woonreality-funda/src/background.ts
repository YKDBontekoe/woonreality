import { DEFAULT_API_BASE, apiUrl, type CaptureEnvelope, type LastSave } from "./shared";

type Stored = {
  token?: string;
  apiBase?: string;
  autoSave?: boolean;
  lastSave?: LastSave;
};

const INGEST_COOLDOWN_MS = 15 * 60 * 1000;

async function getStore(): Promise<Stored> {
  return await chrome.storage.local.get(["token", "apiBase", "autoSave", "lastSave"]) as Stored;
}

async function setStore(patch: Stored) {
  await chrome.storage.local.set(patch);
}

async function ingest(payload: CaptureEnvelope, force: boolean) {
  const store = await getStore();
  if (!store.token) return { ok: false, error: "Koppel de extensie eerst op woonreality.nl/extensie." };
  if (store.autoSave === false && !force) return { ok: false, skipped: true };
  const last = store.lastSave;
  if (!force && last?.url === payload.sourceUrl && Date.now() - Date.parse(last.at) < INGEST_COOLDOWN_MS) {
    return { ok: true, skipped: true, bagVboId: last.bagVboId };
  }
  const base = store.apiBase || DEFAULT_API_BASE;
  let response: Response;
  try {
    response = await fetch(apiUrl(base, "/api/listing/extension/ingest"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${store.token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, error: "Geen verbinding met WoonReality." };
  }
  const body = await response.json().catch(() => ({})) as { error?: string; bagVboId?: string; listing?: { askingPrice?: number } };
  if (response.status === 401) {
    await setStore({ token: "" });
    return { ok: false, error: body.error ?? "Koppeling verlopen. Koppel opnieuw via /extensie." };
  }
  if (!response.ok || !body.bagVboId) {
    return { ok: false, error: body.error ?? "Opslaan is niet gelukt." };
  }
  const lastSave: LastSave = {
    bagVboId: body.bagVboId,
    url: payload.sourceUrl,
    at: new Date().toISOString(),
    askingPrice: body.listing?.askingPrice,
  };
  await setStore({ lastSave });
  return { ok: true, bagVboId: body.bagVboId };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const reply = (value: unknown) => {
    sendResponse(value);
  };
  if (message?.type === "pair" && typeof message.token === "string") {
    void setStore({ token: message.token, apiBase: typeof message.apiBase === "string" ? message.apiBase : DEFAULT_API_BASE }).then(() => {
      reply({ ok: true });
    });
    return true;
  }
  if (message?.type === "unpair") {
    void chrome.storage.local.remove(["token"]).then(() => reply({ ok: true }));
    return true;
  }
  if (message?.type === "set-auto-save") {
    void setStore({ autoSave: Boolean(message.value) }).then(() => reply({ ok: true }));
    return true;
  }
  if (message?.type === "get-state") {
    void getStore().then((store) => reply({
      paired: Boolean(store.token),
      autoSave: store.autoSave !== false,
      lastSave: store.lastSave ?? null,
      apiBase: store.apiBase || DEFAULT_API_BASE,
      version: chrome.runtime.getManifest().version,
    }));
    return true;
  }
  if (message?.type === "listing-captured" && message.payload) {
    void ingest(message.payload as CaptureEnvelope, false).then(reply);
    return true;
  }
  if (message?.type === "listing-save" && message.payload) {
    void ingest(message.payload as CaptureEnvelope, true).then(reply);
    return true;
  }
  if (message?.type === "save-active-tab") {
    const tabId = sender.tab?.id;
    void chrome.tabs.query({ active: true, currentWindow: true }).then(async (tabs) => {
      const id = tabId ?? tabs[0]?.id;
      if (!id) return reply({ ok: false, error: "Geen Funda-tabblad gevonden." });
      try {
        await chrome.tabs.sendMessage(id, { type: "save-current" });
        reply({ ok: true });
      } catch {
        reply({ ok: false, error: "Open een Funda-advertentie en probeer opnieuw." });
      }
    });
    return true;
  }
  return false;
});
