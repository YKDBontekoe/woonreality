import { NextResponse } from "next/server";
import { EXTENSION_VERSION, GECKO_EXTENSION_ID, PARSER_VERSION } from "@/src/lib/listing-extract";
import { publicSiteOrigin } from "@/src/lib/extension-auth";

export const runtime = "nodejs";

function extensionRelease(origin = publicSiteOrigin()) {
  return {
    name: "WoonReality Funda",
    version: EXTENSION_VERSION,
    parserVersion: PARSER_VERSION,
    geckoId: GECKO_EXTENSION_ID,
    chromeZipUrl: `${origin}/extension/woonreality-funda-chrome.zip`,
    firefoxXpiUrl: `${origin}/extension/woonreality-funda-firefox.xpi`,
    publishedAt: new Date().toISOString(),
  };
}

export async function GET() {
  return NextResponse.json(extensionRelease(), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
