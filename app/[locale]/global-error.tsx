"use client";

import { useLocale, useTranslations } from "next-intl";

// Self-contained error screen: it replaces the root layout, so it cannot rely
// on the app stylesheet or the theme init script. The inline style block
// supports both OS preference and the visitor's stored theme choice.
const ERROR_STYLES = `
  :root { --ge-bg: #fbfbfd; --ge-ink: #1d1d1f; --ge-muted: #6e6e73; --ge-faint: #75757c; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) { --ge-bg: #0d0f13; --ge-ink: #f2f2f7; --ge-muted: #b8b8c0; --ge-faint: #9a9aa3; }
  }
  :root[data-theme="dark"] { --ge-bg: #0d0f13; --ge-ink: #f2f2f7; --ge-muted: #b8b8c0; --ge-faint: #9a9aa3; }
`;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");
  const locale = useLocale();

  return (
    <html lang={locale}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: ERROR_STYLES }} />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var s=localStorage.getItem("woonreality-theme");if(s==="light"||s==="dark")document.documentElement.dataset.theme=s;}catch(e){}`,
          }}
        />
      </head>
      <body style={{
        margin: 0,
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--ge-bg)",
        color: "var(--ge-ink)",
        fontFamily: '"DM Sans", sans-serif',
        textAlign: "center",
        padding: "24px",
      }}>
        <div>
          <p style={{ color: "#2770ca", fontWeight: 700, fontSize: 13, letterSpacing: ".08em", textTransform: "uppercase" }}>{t("eyebrow")}</p>
          <h1 style={{ fontSize: 28, margin: "8px 0" }}>{t("title")}</h1>
          <p style={{ color: "var(--ge-muted)", maxWidth: 420, margin: "0 auto 20px" }}>
            {t("globalCopy")}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: 38,
              padding: "0 18px",
              border: 0,
              borderRadius: 10,
              color: "#fff",
              background: "#0a84ff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {t("retry")}
          </button>
          {error.digest && (
            <p style={{ color: "var(--ge-faint)", fontSize: 12, marginTop: 16 }}>
              {t("errorCode")} <code>{error.digest}</code>
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
