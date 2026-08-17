import assert from "node:assert/strict";
import test from "node:test";
import { GET as getIsochrone } from "@/app/api/map/isochrone/route";
import { GET as getRivmSample } from "@/app/api/map/rivm/sample/route";
import { GET as getRivmTile } from "@/app/api/map/rivm/[layer]/[z]/[x]/[y]/route";
import { circlePolygon, defaultMapOverlays, gardenOrientation, houseNumberFromLabel } from "@/src/lib/map/geo";
import { LIGHT_PRESETS, sunLabelForPreset } from "@/src/lib/map/style";
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

test("sun presets keep Dutch labels including winter light", () => {
  assert.deepEqual(LIGHT_PRESETS.map((item) => item.key), ["dawn", "day", "dusk", "winter", "night"]);
  assert.equal(sunLabelForPreset("dusk"), "zon uit het westen");
  assert.equal(sunLabelForPreset("winter"), "lage winterzon uit het zuiden");
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

test("defaultMapOverlays turns on context plus attention rasters", () => {
  const overlays = defaultMapOverlays([
    { key: "noise", severity: "attention" },
    { key: "air", severity: "attention" },
    { key: "green", severity: "good" },
  ]);
  assert.equal(overlays.nearby, true);
  assert.equal(overlays.walk, true);
  assert.equal(overlays.transit, true);
  assert.equal(overlays.roads, true);
  assert.equal(overlays.noise, true);
  assert.equal(overlays.no2, true);
  assert.equal(overlays.pm25, true);
  assert.equal(overlays.green, true);
});

test("isochrone and RIVM sample reject incomplete requests", async () => {
  const isochrone = await getIsochrone(new Request("http://localhost/api/map/isochrone"));
  const sample = await getRivmSample(new Request("http://localhost/api/map/rivm/sample?layer=secret&lat=52&lng=6"));
  assert.equal(isochrone.status, 400);
  assert.equal(sample.status, 400);
});
