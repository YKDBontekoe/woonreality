"use client";

import { useLocale, useTranslations } from "next-intl";

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
      <body style={{
        margin: 0,
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#fbfbfd",
        color: "#1d1d1f",
        fontFamily: '"DM Sans", sans-serif',
        textAlign: "center",
        padding: "24px",
      }}>
        <div>
          <p style={{ color: "#2770ca", fontWeight: 700, fontSize: 13, letterSpacing: ".08em", textTransform: "uppercase" }}>{t("eyebrow")}</p>
          <h1 style={{ fontSize: 28, margin: "8px 0" }}>{t("title")}</h1>
          <p style={{ color: "#6e6e73", maxWidth: 420, margin: "0 auto 20px" }}>
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
            <p style={{ color: "#75757c", fontSize: 12, marginTop: 16 }}>
              {t("errorCode")} <code>{error.digest}</code>
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
