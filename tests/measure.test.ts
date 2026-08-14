import assert from "node:assert/strict";
import test from "node:test";
import type { Geometry } from "geojson";
import { distanceToGeometryM, geometryAreaM2, haversineM } from "@/src/lib/geo/measure";

test("haversineM is zero for identical coordinates", () => {
  assert.equal(haversineM({ lat: 52, lng: 5 }, { lat: 52, lng: 5 }), 0);
});

test("geometryAreaM2 estimates a one-hectare square near the Dutch origin", () => {
  const origin = { lat: 52, lng: 5 };
  const side = 100 / (111_320 * Math.cos((origin.lat * Math.PI) / 180));
  const latSide = 100 / 111_320;
  const geometry: Geometry = {
    type: "Polygon",
    coordinates: [[
      [5, 52],
      [5 + side, 52],
      [5 + side, 52 + latSide],
      [5, 52 + latSide],
      [5, 52],
    ]],
  };

  assert.ok(Math.abs(geometryAreaM2(geometry, origin) - 10_000) < 20);
});

test("distanceToGeometryM returns the nearest vertex distance", () => {
  const geometry: Geometry = {
    type: "LineString",
    coordinates: [[5, 52], [5.01, 52]],
  };

  const distance = distanceToGeometryM({ lat: 52, lng: 5.005 }, geometry);
  assert.ok(distance > 300);
  assert.ok(distance < 400);
});
