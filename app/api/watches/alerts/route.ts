import { NextResponse } from "next/server";
import { z } from "zod";
import { apiContext, currentUser, jsonError, privateHeaders, routeError } from "@/src/lib/api/handlers";
import { isValidBagId } from "@/src/lib/validation/workspace";
import { getWatchSnapshot, putWatchSnapshot } from "@/src/lib/db/repository";
import { buildWatchDigest, diffWatchDigests, type WatchChange, type WatchDigestInput } from "@/src/lib/watch";

export const runtime = "nodejs";
export const maxDuration = 30;

const watchComponentSchema = z.object({
  key: z.string().min(1).max(120),
  label: z.string().max(200),
  score: z.number().finite(),
});

const watchAnalysisSchema = z.object({
  overallScore: z.number().finite(),
  scoringVersion: z.string().min(1).max(64),
  generatedAt: z.string().min(1),
  components: z.array(watchComponentSchema).max(80),
});

const watchBodySchema = z.object({
  analyses: z.record(z.string(), watchAnalysisSchema),
}).strict();

type WatchedHome = {
  bagVboId: string;
  addressLabel: string;
  since: string | null;
  overallFrom: number | null;
  changes: WatchChange[];
};

export async function POST(request: Request) {
  const { t } = apiContext(request);
  try {
    const { supabase, user } = await currentUser();
    if (!user) return jsonError(t("errors.loginToWatch"), 401);
    const parsedBody = watchBodySchema.safeParse(await request.json());
    if (!parsedBody.success) return jsonError("Ongeldige woninganalyses ontvangen.", 400);
    const submitted = Object.entries(parsedBody.data.analyses)
      .filter(([bagId]) => isValidBagId(bagId))
      .slice(0, 12);

    const { data: savedRows, error: savedError } = await supabase
      .from("saved_properties")
      .select("bag_vbo_id,address_label")
      .eq("user_id", user.id)
      .limit(12);
    if (savedError) throw savedError;
    const savedByBagId = new Map((savedRows ?? []).map((row) => [row.bag_vbo_id as string, row.address_label as string]));

    const watches: WatchedHome[] = [];
    for (const [bagVboId, submittedAnalysis] of submitted) {
      const addressLabel = savedByBagId.get(bagVboId);
      if (!addressLabel) continue;
      const digest = buildWatchDigest(submittedAnalysis as WatchDigestInput);
      const previous = await getWatchSnapshot(bagVboId, digest.scoringVersion);
      await putWatchSnapshot(bagVboId, digest, digest.scoringVersion);
      watches.push({
        bagVboId,
        addressLabel,
        since: previous?.capturedAt ?? null,
        overallFrom: previous?.overallScore ?? null,
        changes: previous ? diffWatchDigests(previous, digest) : [],
      });
    }

    return NextResponse.json(
      { checkedAt: new Date().toISOString(), watches },
      { headers: privateHeaders() },
    );
  } catch (error) {
    return routeError(error, t("errors.watchCheckFailed"), 502);
  }
}
