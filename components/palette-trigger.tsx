"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

/** Visible trigger for the ⌘K command palette (keyboard-only discovery
 * before this). Dispatches a window event the palette listens for. */
export function PaletteTrigger() {
  const t = useTranslations("common");

  return (
    <button
      type="button"
      className="theme-toggle palette-trigger"
      aria-label={t("paletteTriggerAria")}
      aria-keyshortcuts="Meta+K Control+K"
      title={t("paletteTriggerAria")}
      onClick={() => window.dispatchEvent(new Event("woonreality:open-palette"))}
    >
      <Search size={15} aria-hidden="true" />
    </button>
  );
}
