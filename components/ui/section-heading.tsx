import type { ReactNode } from "react";

export function SectionHeading({
  kicker,
  title,
  lead,
  children,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="section-heading-block">
      {kicker ? <div className="section-kicker">{kicker}</div> : null}
      <h2>{title}</h2>
      {lead ? <p className="section-heading-lead">{lead}</p> : null}
      {children}
    </div>
  );
}
