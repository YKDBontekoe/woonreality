import type { HTMLAttributes, ReactNode } from "react";

type CardTone = "default" | "soft" | "accent";

export function Card({
  children,
  tone = "default",
  className = "",
  ...props
}: HTMLAttributes<HTMLElement> & { children: ReactNode; tone?: CardTone }) {
  const toneClass = tone === "default" ? "" : `ui-card--${tone}`;
  return (
    <section className={["ui-card", toneClass, className].filter(Boolean).join(" ")} {...props}>
      {children}
    </section>
  );
}
