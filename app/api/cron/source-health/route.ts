import { NextResponse } from "next/server";
import { checkSources } from "@/src/lib/sources/health";

export const runtime = "nodejs";

function authorized(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;
  if (!configuredSecret) return process.env.NODE_ENV !== "production";
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${configuredSecret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sources = await checkSources();
  const ok = sources.every((source) => source.ok && source.sampleRecordValid);
  return NextResponse.json({ ok, checkedAt: new Date().toISOString(), sources }, { status: ok ? 200 : 502 });
}
