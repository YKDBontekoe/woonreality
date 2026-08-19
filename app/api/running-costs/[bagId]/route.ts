import { NextResponse } from "next/server";
import { getPropertyById } from "@/src/lib/sources/pdok/bag";
import { fetchLatestEnergyTariffs, fetchEnergyConsumption } from "@/src/lib/sources/cbs-energy";
import { estimateRunningCosts } from "@/src/lib/running-costs";
import { redactError, toUserMessage } from "@/src/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET(request: Request, context: { params: Promise<{ bagId: string }> }) {
  const { bagId } = await context.params;
  const url = new URL(request.url);
  const vveParam = url.searchParams.get("vveContribution");
  const gasParam = url.searchParams.get("gasConnection");
  const housingTypeParam = url.searchParams.get("housingType");

  try {
    const parseVveContribution = (input: string | null): number | undefined | null => {
      if (input == null) return undefined;
      const value = Number(input);
      if (!Number.isFinite(value)) return null;
      if (value < 0) return null;
      // Keep in sync with listing extraction schema constraints.
      if (value > 100_000) return null;
      return value;
    };

    const parsedVve = parseVveContribution(vveParam);
    if (parsedVve === null) {
      return NextResponse.json({ error: "Ongeldige VvE-bijdrage." }, { status: 400 });
    }

    const property = await getPropertyById(decodeURIComponent(bagId));

    const [tariffs, consumption] = await Promise.all([
      fetchLatestEnergyTariffs(),
      fetchEnergyConsumption(
        property.areaM2,
        property.buildingYear,
        housingTypeParam ?? undefined,
      ),
    ]);

    const estimate = estimateRunningCosts({
      tariffs,
      consumption,
      areaM2: property.areaM2,
      vveContribution: parsedVve ?? undefined,
      gasConnection: gasParam === "false" ? false : undefined,
    });

    return NextResponse.json(estimate, {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
    });
  } catch (error) {
    console.error("Running costs estimation failed", redactError(error));
    return NextResponse.json(
      { error: toUserMessage(error, "De woonlastenschatting kon niet worden gemaakt.") },
      { status: 502 },
    );
  }
}
