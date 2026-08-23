import { updateSupabaseSession } from "@/src/lib/supabase/middleware";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return updateSupabaseSession(request);
}

export const config = {
  // Skip static assets, prefetch/data requests, and the public read-only API
  // routes whose responses are CDN-cacheable — running the Supabase session
  // refresh there would add a network hop and vary responses on cookies.
  matcher: [
    "/((?!_next/static|_next/image|_next/data|favicon.ico|api/(?:address|analysis|map|place|mortgage|health)/?|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
