"use client";

import { useTranslations } from "next-intl";

export function SkipLink() {
  const t = useTranslations("common");
  return (
    <a className="skip-link" href="#hoofdinhoud">
      {t("skipToContent")}
    </a>
  );
}
