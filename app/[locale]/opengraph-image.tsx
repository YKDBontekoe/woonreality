import { ImageResponse } from "next/og";
import type { Locale } from "@/src/lib/i18n/config";
import enMetadata from "@/messages/en/metadata.json";
import nlMetadata from "@/messages/nl/metadata.json";

export const alt = "WoonReality";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const METADATA = { nl: nlMetadata, en: enMetadata } as const;

export default async function OpenGraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const copy = METADATA[(locale as Locale) in METADATA ? (locale as Locale) : "nl"];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #0a84ff 0%, #2770ca 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "rgba(255,255,255,0.16)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 34,
            }}
          >
            ⌂
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.02em" }}>WoonReality</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 62, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.03em", maxWidth: 940 }}>
            {copy.title}
          </div>
          <div style={{ fontSize: 30, lineHeight: 1.4, opacity: 0.85, maxWidth: 880 }}>
            {copy.description}
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 24, opacity: 0.75 }}>woonreality.vercel.app</div>
      </div>
    ),
    size,
  );
}
