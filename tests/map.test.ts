import assert from "node:assert/strict";
import test from "node:test";
import { GET as getRivmTile } from "@/app/api/map/rivm/[layer]/[z]/[x]/[y]/route";
import { LIGHT_PRESETS, sunLabelForPreset } from "@/src/lib/map/style";
import { isValidTile, parseRivmOverlay, parseTileIndex, rivmGetMapUrl, xyzToMercatorBbox } from "@/src/lib/map/tiles";

test("RIVM overlay allowlist only accepts noise and no2", () => {
  assert.equal(parseRivmOverlay("noise"), "noise");
  assert.equal(parseRivmOverlay("no2"), "no2");
  assert.equal(parseRivmOverlay("pm25"), null);
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

test("sun presets keep Dutch labels for the four light states", () => {
  assert.deepEqual(LIGHT_PRESETS.map((item) => item.id), ["dawn", "day", "dusk", "night"]);
  assert.equal(sunLabelForPreset("dusk"), "zon uit het westen");
});

test("RIVM tile proxy rejects unknown layers without fetching", async () => {
  const response = await getRivmTile(
    new Request("http://localhost/api/map/rivm/secret/1/0/0"),
    { params: Promise.resolve({ layer: "secret", z: "1", x: "0", y: "0" }) },
  );
  assert.equal(response.status, 400);
});
