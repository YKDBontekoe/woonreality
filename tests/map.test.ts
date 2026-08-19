import assert from "node:assert/strict";
import test from "node:test";
import { GET as getIsochrone } from "@/app/api/map/isochrone/route";
import { GET as getRivmSample } from "@/app/api/map/rivm/sample/route";
import { GET as getRivmTile } from "@/app/api/map/rivm/[layer]/[z]/[x]/[y]/route";
import { circlePolygon, defaultMapOverlays, gardenOrientation, houseNumberFromLabel, overlaysForScene } from "@/src/lib/map/geo";
import {
  contourMinutes,
  ISOCHRONE_DENOISE,
  ISOCHRONE_GENERALIZE_M,
  isochroneLngLatBounds,
  mapboxIsochroneUrl,
  mergeLngLatBounds,
  parseIsochroneMinutes,
  parseIsochroneProfile,
} from "@/src/lib/map/isochrone";
import {
  LIGHT_PRESETS,
  formatMapHour,
  lightPeriodLabel,
  lightPresetForHour,
  lightsForHour,
  sunDirectionForHour,
  sunLabelForHour,
  sunLabelForPreset,
} from "@/src/lib/map/style";
import { isValidTile, parseRivmOverlay, parseTileIndex, rivmGetMapUrl, xyzToMercatorBbox } from "@/src/lib/map/tiles";

test("RIVM overlay allowlist only accepts noise, no2 and pm25", () => {
  assert.equal(parseRivmOverlay("noise"), "noise");
  assert.equal(parseRivmOverlay("no2"), "no2");
  assert.equal(parseRivmOverlay("pm25"), "pm25");
  assert.equal(parseRivmOverlay("../alo"), null);
});

test("tile indices reject non-integers and out-of-range XYZ", () => {
  assert.equal(parseTileIndex("12"), 12);
  assert.equal(parseTileIndex("-1"), null);
  assert.equal(parseTileIndex("1.5"), null);
  assert.equal(isValidTile(2, 0, 0), true);
  assert.equal(isValidTile(2, 4, 0), false);
  assert.equal(isValidTile(23, 0, 0), false);
});

test("xyzToMercatorBbox covers a known zoom-0 world extent", () => {
  const [minX, minY, maxX, maxY] = xyzToMercatorBbox(0, 0, 0);
  assert.ok(minX < -20_000_000 && maxX > 20_000_000);
  assert.ok(minY < -20_000_000 && maxY > 20_000_000);
  assert.ok(minX < maxX && minY < maxY);
});

test("rivm GetMap URL stays on the allowlisted WMS layer", () => {
  const url = rivmGetMapUrl("noise", [1, 2, 3, 4]);
  assert.match(url, /data\.rivm\.nl\/geo\/alo\/wms/);
  assert.match(url, /rivm_20250101_Geluid_lden_wegverkeer_2022/);
  assert.match(url, /bbox=1%2C2%2C3%2C4/);
});

test("hour slider maps clock time onto Mapbox light presets", () => {
  assert.deepEqual(LIGHT_PRESETS.map((item) => item.id), ["dawn", "day", "dusk", "night"]);
  assert.equal(lightPresetForHour(0), "night");
  assert.equal(lightPresetForHour(6), "dawn");
  assert.equal(lightPresetForHour(14), "day");
  assert.equal(lightPresetForHour(19), "dusk");
  assert.equal(lightPresetForHour(22), "night");
  assert.equal(formatMapHour(9), "09:00");
  assert.equal(lightPeriodLabel(19), "Avond");
  assert.equal(sunLabelForHour(14), "zon uit het zuiden");
  assert.equal(sunLabelForPreset("dusk"), "zon uit het westen");
});

test("sun direction moves from east at dawn to west at dusk", () => {
  const [dawnAzimuth, dawnPolar] = sunDirectionForHour(6);
  const [noonAzimuth, noonPolar] = sunDirectionForHour(13);
  const [duskAzimuth, duskPolar] = sunDirectionForHour(18);
  assert.ok(dawnAzimuth < noonAzimuth && noonAzimuth < duskAzimuth);
  assert.ok(noonPolar < dawnPolar);
  assert.ok(noonPolar < duskPolar);
  const duskLights = lightsForHour(18, true);
  const sun = duskLights.find((item) => item.id === "woonreality-sun");
  assert.equal(sun?.properties["cast-shadows"], true);
  assert.ok((sun?.properties["shadow-intensity"] ?? 0) > 0.5);
  assert.deepEqual(sun?.properties.direction, sunDirectionForHour(18));
});

test("RIVM tile proxy rejects unknown layers without fetching", async () => {
  const response = await getRivmTile(
    new Request("http://localhost/api/map/rivm/secret/1/0/0"),
    { params: Promise.resolve({ layer: "secret", z: "1", x: "0", y: "0" }) },
  );
  assert.equal(response.status, 400);
});

test("circlePolygon closes a 250m ring around a Dutch coordinate", () => {
  const polygon = circlePolygon({ lat: 52.346, lng: 5.984 }, 250);
  assert.equal(polygon.type, "Polygon");
  assert.equal(polygon.coordinates[0]?.[0]?.[0], polygon.coordinates[0]?.at(-1)?.[0]);
  assert.ok(polygon.coordinates[0]!.length > 32);
});

test("gardenOrientation maps Dutch listing copy to a bearing", () => {
  assert.equal(gardenOrientation("Gelegen op het westen")?.bearing, 270);
  assert.equal(gardenOrientation("tuin op het zuidoosten")?.bearing, 135);
  assert.equal(gardenOrientation(undefined), null);
  assert.equal(houseNumberFromLabel("Korenstraat 18, Epe"), "18");
});

test("defaultMapOverlays keeps the street quiet and turns on attention rasters", () => {
  const overlays = defaultMapOverlays([
    { key: "noise", severity: "attention" },
    { key: "air", severity: "attention" },
    { key: "green", severity: "good" },
  ]);
  assert.equal(overlays.nearby, true);
  assert.equal(overlays.walk, false);
  assert.equal(overlays.roads, false);
  assert.equal(overlays.noise, true);
  assert.equal(overlays.no2, true);
  assert.equal(overlays.pm25, false);
  assert.equal(overlays.green, true);
});

test("overlaysForScene isolates health and reach layers", () => {
  const health = overlaysForScene("health");
  assert.equal(health.noise, true);
  assert.equal(health.no2, true);
  assert.equal(health.nearby, false);
  const reach = overlaysForScene("reach");
  assert.equal(reach.walk, true);
  assert.equal(reach.transit, true);
  assert.equal(reach.noise, false);
});

test("isochrone contours stay on the street-network API, not a growing circle", () => {
  assert.deepEqual(contourMinutes(5), [5]);
  assert.deepEqual(contourMinutes(10), [5, 10]);
  assert.deepEqual(contourMinutes(20), [5, 10, 15, 20]);
  assert.deepEqual(contourMinutes(30), [15, 20, 25, 30]);
  assert.equal(parseIsochroneProfile(null), "walking");
  assert.equal(parseIsochroneProfile("driving"), "driving");
  assert.equal(parseIsochroneProfile("transit"), null);
  assert.equal(parseIsochroneMinutes(null), 10);
  assert.equal(parseIsochroneMinutes("15"), 15);
  assert.equal(parseIsochroneMinutes("7"), null);
  assert.equal(parseIsochroneMinutes("99"), null);
  const url = mapboxIsochroneUrl({
    token: "pk.test",
    lng: 5.984,
    lat: 52.346,
    profile: "walking",
    minutes: 15,
  });
  assert.match(url.pathname, /\/isochrone\/v1\/mapbox\/walking\/5\.984,52\.346/);
  assert.equal(url.searchParams.get("polygons"), "true");
  assert.equal(url.searchParams.get("contours_minutes"), "5,10,15");
  assert.equal(url.searchParams.get("denoise"), ISOCHRONE_DENOISE);
  assert.equal(url.searchParams.get("generalize"), ISOCHRONE_GENERALIZE_M);
});

test("isochrone bounds follow an irregular polygon instead of assuming a circle", () => {
  const bounds = isochroneLngLatBounds({
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { contour: 10 },
      geometry: {
        type: "Polygon",
        coordinates: [[[6, 52], [6.02, 52.01], [6.01, 52.03], [5.99, 52.02], [6, 52]]],
      },
    }],
  });
  assert.deepEqual(bounds, [5.99, 52, 6.02, 52.03]);
  assert.deepEqual(mergeLngLatBounds(bounds, [5.9, 51.9, 6.1, 52.1]), [5.9, 51.9, 6.1, 52.1]);
});

test("isochrone and RIVM sample reject incomplete requests", async () => {
  const isochrone = await getIsochrone(new Request("http://localhost/api/map/isochrone"));
  const badProfile = await getIsochrone(new Request("http://localhost/api/map/isochrone?lat=52.346&lng=5.984&profile=transit"));
  const badMinutes = await getIsochrone(new Request("http://localhost/api/map/isochrone?lat=52.346&lng=5.984&minutes=99"));
  const sample = await getRivmSample(new Request("http://localhost/api/map/rivm/sample?layer=secret&lat=52&lng=6"));
  assert.equal(isochrone.status, 400);
  assert.equal(badProfile.status, 400);
  assert.equal(badMinutes.status, 400);
  assert.equal(sample.status, 400);
});
