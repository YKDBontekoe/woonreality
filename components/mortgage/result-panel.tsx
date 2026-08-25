"use client";

import { useTranslations } from "next-intl";
import { formatEuro } from "@/src/lib/purchase";
import type { MortgageScenario } from "@/src/lib/mortgage";

export function MortgageScenarios({ scenarios, open, onToggle }: {
  scenarios: MortgageScenario[];
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("hypotheek");
  if (scenarios.length === 0) return null;
  return <>
    <button className="text-link mortgage-toggle" type="button" onClick={onToggle} aria-expanded={open}>
      {open ? t("hideScenarios") : t("whatIf", { count: scenarios.length })}
    </button>
    {open && <div className="mortgage-scenarios">
      <p className="mortgage-hint">{t("scenariosHint")}</p>
      <ul>
        {scenarios.map((scenario) => (
          <li key={scenario.id}>
            <span>
              {scenario.label}
              {scenario.note ? <small>{scenario.note}</small> : null}
            </span>
            <strong>
              {formatEuro(scenario.maxLoanForPurchase)}
              <em className={scenario.delta > 0 ? "is-up" : scenario.delta < 0 ? "is-down" : undefined}>
                {scenario.delta === 0 ? "±0" : `${scenario.delta > 0 ? "+" : "−"}${formatEuro(Math.abs(scenario.delta))}`}
              </em>
            </strong>
          </li>
        ))}
      </ul>
    </div>}
  </>;
}
