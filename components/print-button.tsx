"use client";

import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";

export function PrintButton({ label }: { label?: string }) {
  const t = useTranslations("common");
  return (
    <button className="secondary-button" type="button" onClick={() => window.print()}>
      <Printer size={14} /> {label ?? t("printPdf")}
    </button>
  );
}
