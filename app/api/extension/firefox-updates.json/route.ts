import { NextResponse } from "next/server";
import { EXTENSION_VERSION, GECKO_EXTENSION_ID } from "@/src/lib/listing-extract";
import { publicSiteOrigin } from "@/src/lib/extension-auth";

export const runtime = "nodejs";

export async function GET() {
  const origin = publicSiteOrigin();
  return NextResponse.json({
    addons: {
      [GECKO_EXTENSION_ID]: {
        updates: [
          {
            version: EXTENSION_VERSION,
            update_link: `${origin}/extension/woonreality-funda-firefox.xpi`,
          },
        ],
      },
    },
  }, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
