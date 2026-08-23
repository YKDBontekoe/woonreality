"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label = "Print / PDF" }: { label?: string }) {
  return (
    <button className="secondary-button" type="button" onClick={() => window.print()}>
      <Printer size={14} /> {label}
    </button>
  );
}
