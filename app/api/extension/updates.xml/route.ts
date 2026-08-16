import { NextResponse } from "next/server";
import { EXTENSION_VERSION } from "@/src/lib/listing-extract";
import { publicSiteOrigin } from "@/src/lib/extension-auth";

export const runtime = "nodejs";

export async function GET() {
  const origin = publicSiteOrigin();
  const appId = process.env.EXTENSION_CHROME_ID?.trim() || "REPLACE_WITH_CHROME_STORE_ID";
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  <app appid="${appId}">
    <updatecheck codebase="${origin}/extension/woonreality-funda-chrome.zip" version="${EXTENSION_VERSION}" />
  </app>
</gupdate>
`;
  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
