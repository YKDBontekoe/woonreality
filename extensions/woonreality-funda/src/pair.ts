const HELLO = "woonreality-extension-hello";
const PAIR = "woonreality-extension-pair";

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data as { type?: string; token?: string } | null;
  if (data?.type !== PAIR || typeof data.token !== "string") return;
  chrome.runtime.sendMessage({ type: "pair", token: data.token, apiBase: location.origin }, (response) => {
    window.postMessage({ type: "woonreality-extension-paired", ok: Boolean(response?.ok), error: response?.error ?? chrome.runtime.lastError?.message }, "*");
  });
});

window.postMessage({ type: HELLO, version: chrome.runtime.getManifest().version }, "*");
