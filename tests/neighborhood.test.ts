import assert from "node:assert/strict";
import test from "node:test";
import { isCbsNumber, parseCbsProperties, schoolScoreFromCbs } from "@/src/lib/sources/cbs";
import { cbsODataEq, cbsODataRegionVariants, latestCbsPeriodKey, periodYearLabel } from "@/src/lib/sources/cbs-odata";
import { parseSesRows } from "@/src/lib/sources/ses";
import { crimeRatePer1000, crimeScoreFromRatePer1000, NL_CRIME_PER_1000, parseCrimeRows } from "@/src/lib/sources/politie";
import { componentFromSignal } from "@/src/lib/scoring/score";
import type { Signal } from "@/src/lib/types";

const fetchedAt = "2026-08-01T00:00:00.000Z";

test("CBS sentinels and Epe-like buurt features parse into neighborhood context", () => {
  assert.equal(isCbsNumber(-99997), false);
  assert.equal(isCbsNumber(-99991), false);
  assert.equal(isCbsNumber(0.5), true);

  const cbs = parseCbsProperties({
    buurtnaam: "Epe Centrum",
    gemeentenaam: "Epe",
    buurtcode: "BU02320000",
    wijkcode: "WK023200",
    gemeentecode: "GM0232",
    aantal_inwoners: 1670,
    bevolkingsdichtheid_inwoners_per_km2: 2697,
    gemiddelde_woningwaarde: 442,
    grote_supermarkt_gemiddelde_afstand_in_km: 0.4,
    huisartsenpraktijk_gemiddelde_afstand_in_km: 0.8,
    percentage_personen_0_tot_15_jaar: 11,
    percentage_huishoudens_met_kinderen: 21,
    percentage_eenpersoonshuishoudens: 43,
    percentage_personen_65_jaar_en_ouder: 40,
    basisonderwijs_gemiddelde_afstand_in_km: 0.5,
    basisonderwijs_gemiddeld_aantal_binnen_1_km: 2.8,
    voortgezet_onderwijs_gem_afstand_in_km: 1.1,
    kinderdagverblijf_gemiddelde_afstand_in_km: 0.5,
    buitenschoolse_opvang_gem_afstand_in_km: 0.5,
    aantal_leerlingen_primair_onderwijs: 100,
    aantal_leerlingen_voortgezet_onderwijs: 80,
    opleidingsniveau_hoog: -99997,
    gemiddeld_inkomen_per_inwoner: -99997,
  }, fetchedAt);

  assert.equal(cbs.buurtcode, "BU02320000");
  assert.equal(cbs.shareAge0to15Pct, 11);
  assert.equal(cbs.shareHouseholdsWithChildrenPct, 21);
  assert.equal(cbs.primarySchoolDistanceKm, 0.5);
  assert.equal(cbs.primaryPupils, 100);
  assert.equal(cbs.averageWoz, 442);
  assert.equal(cbs.supermarketDistanceKm, 0.4);
  assert.equal(cbs.hboStudents, undefined);
  assert.equal(schoolScoreFromCbs(cbs), 8.4);
});

test("schoolScoreFromCbs rewards nearby primary schools and stays within 0-10", () => {
  assert.equal(schoolScoreFromCbs({}), undefined);
  assert.equal(schoolScoreFromCbs({ primarySchoolDistanceKm: 0.5, primarySchoolsWithin1km: 1 }), 8);
  assert.equal(schoolScoreFromCbs({ primarySchoolDistanceKm: 4 }), 1);
  assert.equal(schoolScoreFromCbs({ childcareDistanceKm: 0.3 }), 8.4);
});

test("CBS OData helpers pad region codes and pick the latest yearly period", () => {
  assert.deepEqual(cbsODataRegionVariants("WK023200"), ["WK023200", "WK023200  "]);
  assert.deepEqual(cbsODataRegionVariants("BU02320000"), ["BU02320000"]);
  assert.equal(cbsODataEq("WijkenEnBuurten", "BU02320000"), "WijkenEnBuurten eq 'BU02320000'");
  assert.equal(latestCbsPeriodKey(["2014JJ00", "2024JJ00", "2019JJ00"]), "2024JJ00");
  assert.equal(periodYearLabel("2024JJ00"), "2024");
});

test("SES-WOA parser keeps the newest year and education shares", () => {
  const ses = parseSesRows([
    { Perioden: "2023JJ00", GemiddeldeScore_29: 0.05, Waarde_16: 28, Waarde_19: 40, Waarde_22: 32 },
    { Perioden: "2024JJ00", GemiddeldeScore_29: 0.118, GemiddeldeScore_31: 0.129, GemiddeldeScore_33: -0.028, GemiddeldeScore_35: 0.016, Waarde_16: 27.3, Waarde_19: 40.1, Waarde_22: 32.6 },
  ], "BU02320000", "buurt", fetchedAt);

  assert.ok(ses);
  assert.equal(ses?.periodYear, "2024");
  assert.equal(ses?.sesScore, 0.118);
  assert.equal(ses?.educationHighPct, 32.6);
});

test("crime rate per 1.000 and score bands treat NL-typical as mid-range", () => {
  assert.equal(crimeRatePer1000(75, 1670), 44.9);
  assert.equal(crimeRatePer1000(0, 1000), 0);
  assert.equal(crimeRatePer1000(10, undefined), undefined);

  const nlScore = crimeScoreFromRatePer1000(NL_CRIME_PER_1000);
  assert.equal(nlScore, 6.3);
  assert.ok(nlScore >= 5);
  assert.ok(crimeScoreFromRatePer1000(10) >= 7);
  assert.ok(crimeScoreFromRatePer1000(90) < 5);

  const crime = parseCrimeRows([
    { SoortMisdrijf: "0.0.0 ", Perioden: "2023JJ00", GeregistreerdeMisdrijven_1: 90 },
    { SoortMisdrijf: "0.0.0 ", Perioden: "2024JJ00", GeregistreerdeMisdrijven_1: 75 },
    { SoortMisdrijf: "1.1.1 ", Perioden: "2024JJ00", GeregistreerdeMisdrijven_1: 4 },
    { SoortMisdrijf: "1.4.5 ", Perioden: "2024JJ00", GeregistreerdeMisdrijven_1: 8 },
  ], "BU02320000", "buurt", 1670, fetchedAt);

  assert.ok(crime);
  assert.equal(crime?.total, 75);
  assert.equal(crime?.burglary, 4);
  assert.equal(crime?.assault, 8);
  assert.equal(crime?.per1000, 44.9);
  assert.equal(crime?.periodYear, "2024");
});

test("componentFromSignal applies neighborhood weights for schools and crime", () => {
  const base: Signal = {
    key: "crime",
    label: "Geregistreerde misdrijven",
    value: "45 / 1.000",
    score: 6.3,
    severity: "neutral",
    summary: "Test.",
    action: "Check.",
    confidence: "medium",
    evidence: [{
      id: "politie-misdrijven",
      source: "Politie / CBS",
      sourceUrl: "https://data.politie.nl",
      fetchedAt,
      confidence: "medium",
    }],
  };
  assert.equal(componentFromSignal(base, "crime", "Geregistreerde misdrijven", "Test.").weight, 0.12);
  assert.equal(componentFromSignal({ ...base, key: "schools" }, "schools", "Scholen en opvang", "Test.").weight, 0.12);
});
