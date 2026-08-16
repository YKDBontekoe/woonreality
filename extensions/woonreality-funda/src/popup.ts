type State = {
  paired?: boolean;
  autoSave?: boolean;
  lastSave?: { bagVboId: string; url: string; at: string } | null;
  apiBase?: string;
  version?: string;
};

const statusEl = document.getElementById("status") as HTMLParagraphElement;
const autoEl = document.getElementById("auto") as HTMLInputElement;
const saveEl = document.getElementById("save") as HTMLButtonElement;
const openEl = document.getElementById("open") as HTMLAnchorElement;
const setupEl = document.getElementById("setup") as HTMLAnchorElement;
const pairForm = document.getElementById("pair-form") as HTMLDivElement;
const tokenEl = document.getElementById("token") as HTMLInputElement;
const pairEl = document.getElementById("pair") as HTMLButtonElement;

function render(state: State) {
  const origin = (state.apiBase || "https://woonreality.vercel.app").replace(/\/$/, "");
  setupEl.href = `${origin}/extensie`;
  autoEl.checked = state.autoSave !== false;
  if (!state.paired) {
    statusEl.textContent = "Nog niet gekoppeld. Open de koppelpagina terwijl je bent ingelogd.";
    saveEl.disabled = true;
    openEl.style.display = "none";
    pairForm.hidden = false;
    return;
  }
  pairForm.hidden = true;
  saveEl.disabled = false;
  if (state.lastSave) {
    statusEl.textContent = `Laatst opgeslagen: ${new Date(state.lastSave.at).toLocaleString("nl-NL")}`;
    openEl.style.display = "block";
    openEl.href = `${origin}/woning/${state.lastSave.bagVboId}`;
  } else {
    statusEl.textContent = `Gekoppeld (v${state.version ?? "?"}). Open een Funda-advertentie om kenmerken te bewaren.`;
    openEl.style.display = "none";
  }
}

chrome.runtime.sendMessage({ type: "get-state" }, (state: State) => render(state ?? {}));

autoEl.addEventListener("change", () => {
  chrome.runtime.sendMessage({ type: "set-auto-save", value: autoEl.checked });
});
pairEl.addEventListener("click", () => {
  const token = tokenEl.value.trim();
  if (!token.startsWith("wr_ext_")) {
    statusEl.textContent = "Plak de koppelcode die begint met wr_ext_.";
    return;
  }
  const origin = setupEl.href.replace(/\/extensie\/?$/, "");
  chrome.runtime.sendMessage({ type: "pair", token, apiBase: origin }, () => {
    chrome.runtime.sendMessage({ type: "get-state" }, (state: State) => render(state ?? {}));
  });
});
saveEl.addEventListener("click", () => {
  saveEl.disabled = true;
  chrome.runtime.sendMessage({ type: "save-active-tab" }, (response?: { ok?: boolean; error?: string }) => {
    saveEl.disabled = false;
    statusEl.textContent = response?.ok ? "Bezig met opslaan…" : (response?.error ?? "Opslaan is niet gelukt.");
    window.setTimeout(() => chrome.runtime.sendMessage({ type: "get-state" }, (state: State) => render(state ?? {})), 1200);
  });
});
