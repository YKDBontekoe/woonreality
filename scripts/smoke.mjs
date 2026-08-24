// Route smoke test against a running dev or production server.
// Usage: node scripts/smoke.mjs [baseUrl]   (default http://localhost:3000)
// Exits non-zero when any check fails. Safe for local dev and CI follow-up.
import process from "node:process";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
// SMOKE_OFFLINE=1 skips checks that hit live third-party APIs (CI-safe).
const offline = process.env.SMOKE_OFFLINE === "1";

const checks = [
  { path: "/api/health", expect: 200, label: "health endpoint", live: false },
  { path: "/api/address/search?q=Korenstraat%2018%20Epe", expect: 200, label: "address search (live PDOK)", live: true },
  { path: "/nl", expect: 200, label: "home (nl)" },
  { path: "/en", expect: 200, label: "home (en)" },
  { path: "/nl/hypotheek", expect: 200, label: "mortgage calculator" },
  { path: "/nl/kaart", expect: 200, label: "national map" },
  { path: "/nl/vergelijken", expect: 200, label: "compare dashboard" },
  { path: "/nl/extensie", expect: 200, label: "extension page" },
  { path: "/nl/login", expect: 200, label: "login" },
  { path: "/robots.txt", expect: 200, label: "robots.txt" },
  { path: "/sitemap.xml", expect: 200, label: "sitemap.xml" },
  { path: "/favicon.ico", expect: 200, label: "favicon.ico" },
  { path: "/nl/bestaat-niet", expect: 404, label: "unknown route 404s" },
];

let failed = 0;
let skipped = 0;
for (const check of checks) {
  if (offline && check.live) {
    console.log(`- ${check.label} (${check.path}) — skipped (SMOKE_OFFLINE)`);
    skipped++;
    continue;
  }
  let status = 0;
  try {
    const response = await fetch(`${base}${check.path}`, { redirect: "manual" });
    status = response.status;
  } catch (error) {
    console.error(`✗ ${check.label} (${check.path}) — request failed: ${error.message}`);
    failed++;
    continue;
  }
  const ok = status === check.expect;
  console.log(`${ok ? "✓" : "✗"} ${check.label} (${check.path}) — ${status}${ok ? "" : `, expected ${check.expect}`}`);
  if (!ok) failed++;
}

const summary = skipped > 0 ? `${checks.length - skipped}/${checks.length} checks` : `${checks.length} checks`;
console.log(failed === 0 ? `\nAll ${summary} passed against ${base}` : `\n${failed} of ${summary} failed against ${base}`);
process.exit(failed === 0 ? 0 : 1);
