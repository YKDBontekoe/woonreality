import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "@/src/lib/i18n/routing";
import { updateSupabaseSession } from "@/src/lib/supabase/middleware";

const handleI18nRouting = createMiddleware(routing);

export default async function middleware(request: NextRequest) {
  // Refresh the Supabase session first: it mutates request cookies and may
  // need to hand refreshed auth cookies back to the browser.
  const supabaseResponse = await updateSupabaseSession(request);

  // Route handlers keep working without a locale prefix — only page routes
  // get locale negotiation and rewrites.
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api") || pathname.startsWith("/auth")) {
    return supabaseResponse;
  }

  // Run locale negotiation/rewrites on the (cookie-refreshed) request.
  const response = handleI18nRouting(request) ?? supabaseResponse;

  // Preserve any auth cookies that were rotated during the session refresh,
  // including on redirects emitted by the i18n middleware.
  for (const cookie of supabaseResponse.cookies.getAll()) {
    response.cookies.set(cookie);
  }

  return response;
}

export const config = {
  // Skip static assets, prefetch/data requests, the public read-only API
  // routes whose responses are CDN-cacheable, and the Supabase auth callback
  // route handler. Everything else gets locale routing + session refresh.
  matcher: [
    "/((?!_next/static|_next/image|_next/data|favicon\\.ico|robots\\.txt|sitemap\\.xml|api/(?:address|analysis|map|place|mortgage|health)/?|auth/callback|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
