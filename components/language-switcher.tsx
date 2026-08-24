"use client";

import { useLocale, useTranslations } from "next-intl";
import { Languages } from "lucide-react";
import { Link, usePathname } from "@/src/lib/i18n/navigation";
import { locales } from "@/src/lib/i18n/config";

export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("common");

  return (
    <div className="lang-switch" role="group" aria-label={t("languageSwitcherAria")}>
      <Languages size={14} aria-hidden />
      {locales.map((target) => (
        <Link
          key={target}
          href={pathname || "/"}
          locale={target}
          className={`lang-switch-option ${target === locale ? "lang-switch-current" : ""}`}
          aria-current={target === locale ? "true" : undefined}
        >
          {target === "nl" ? "NL" : "EN"}
        </Link>
      ))}
    </div>
  );
}
