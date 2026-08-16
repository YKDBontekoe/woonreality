import type { ReactNode } from "react";

export function Notice({
  children,
  tone = "info",
  role = "status",
}: {
  children: ReactNode;
  tone?: "info" | "warning";
  role?: "status" | "alert";
}) {
  return (
    <div className={`ui-notice ${tone === "warning" ? "warning" : ""}`} role={role}>
      {children}
    </div>
  );
}
