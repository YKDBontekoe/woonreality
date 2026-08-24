"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageShell>
      <section className="notfound" aria-labelledby="error-title">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1 id="error-title">{t("title")}</h1>
        <p className="notfound-copy">
          {t("routeCopy")}
        </p>
        <div className="notfound-actions">
          <Button variant="primary" onClick={reset}>{t("retry")}</Button>
          <Button variant="secondary" href="/">{t("home")}</Button>
        </div>
        {error.digest && (
          <p className="notfound-digest">
            {t("errorCode")} <code>{error.digest}</code>
          </p>
        )}
      </section>
    </PageShell>
  );
}
