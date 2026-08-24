"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

type ThemeChoice = "light" | "dark" | "system";

const STORAGE_KEY = "woonreality-theme";
const CHOICES: ThemeChoice[] = ["light", "dark", "system"];

export function applyTheme(choice: ThemeChoice) {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = choice === "system" ? (systemDark ? "dark" : "light") : choice;
  document.documentElement.dataset.theme = resolved;
}

function storedChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return CHOICES.includes(value as ThemeChoice) ? (value as ThemeChoice) : "system";
  } catch {
    return "system";
  }
}

/** Three-state theme switch. The effective theme is always written to
 * `<html data-theme>` so dark.css can key off the attribute alone. */
export function ThemeToggle() {
  const t = useTranslations("header");
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    const initial = storedChoice();
    setChoice(initial);
    // Re-apply on mount: the inline head script already did this before
    // paint, but keep them in sync if storage changed since.
    applyTheme(initial);
  }, []);

  // While following the system, keep <html data-theme> in lockstep with the
  // OS preference so toggling dark mode at system level updates instantly.
  useEffect(() => {
    if (choice !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [choice]);

  function cycle() {
    const next = CHOICES[(CHOICES.indexOf(choice) + 1) % CHOICES.length];
    setChoice(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode etc.: keep the in-memory choice for this page view.
    }
    applyTheme(next);
  }

  const label = choice === "light" ? t("themeLight") : choice === "dark" ? t("themeDark") : t("themeSystem");
  const Icon = choice === "light" ? Sun : choice === "dark" ? Moon : Monitor;

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={cycle}
      aria-label={label}
      title={label}
      data-theme-choice={choice}
    >
      <Icon size={15} aria-hidden="true" />
    </button>
  );
}
