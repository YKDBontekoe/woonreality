import assert from "node:assert/strict";
import test from "node:test";
import { bearingDeg, orientationLabel, polygonLongestEdgeBearing, solarPosition } from "@/src/lib/solar";

const UTRECHT = { lat: 52.09, lng: 5.12 };

test("summer solstice noon sun stands high and due south-ish in NL", () => {
  // 21 June ~11:40 UTC (solar noon for lng 5.12 with equation of time).
  const noon = solarPosition(new Date("2026-06-21T11:42:00Z"), UTRECHT);
  assert.ok(noon.elevationDeg > 58 && noon.elevationDeg < 65, `elevation ${noon.elevationDeg}`);
  assert.ok(noon.azimuthDeg > 165 && noon.azimuthDeg < 195, `azimuth ${noon.azimuthDeg}`);
});

test("winter solstice noon sun stays low in NL", () => {
  const noon = solarPosition(new Date("2026-12-21T11:50:00Z"), UTRECHT);
  assert.ok(noon.elevationDeg > 12 && noon.elevationDeg < 18, `elevation ${noon.elevationDeg}`);
});

test("sun rises east-ish and sets west-ish on the equinox", () => {
  const sunrise = solarPosition(new Date("2026-03-20T05:55:00Z"), UTRECHT);
  const sunset = solarPosition(new Date("2026-03-20T17:15:00Z"), UTRECHT);
  assert.ok(sunrise.azimuthDeg > 75 && sunrise.azimuthDeg < 110, `sunrise azimuth ${sunrise.azimuthDeg}`);
  assert.ok(sunset.azimuthDeg > 250 && sunset.azimuthDeg < 285, `sunset azimuth ${sunset.azimuthDeg}`);
});

test("morning sun leans east, evening sun leans west", () => {
  const morning = solarPosition(new Date("2026-07-01T07:00:00Z"), UTRECHT);
  const evening = solarPosition(new Date("2026-07-01T19:00:00Z"), UTRECHT);
  assert.ok(morning.azimuthDeg < 180);
  assert.ok(evening.azimuthDeg > 180);
});

test("bearing points north/east/south/west as expected", () => {
  const near = (value: number, expected: number) => assert.ok(Math.abs(value - expected) <= 2, `bearing ${value} ≈ ${expected}`);
  near(bearingDeg({ lat: 52, lng: 5 }, { lat: 53, lng: 5 }), 0);
  near(bearingDeg({ lat: 52, lng: 5 }, { lat: 52, lng: 6.4 }), 90);
  near(bearingDeg({ lat: 52, lng: 5 }, { lat: 51, lng: 5 }), 180);
  near(bearingDeg({ lat: 52, lng: 5 }, { lat: 52, lng: 3.6 }), 270);
});

test("orientation labels snap to the eight-wind rose", () => {
  assert.equal(orientationLabel(0), "noord");
  assert.equal(orientationLabel(45), "noordoost");
  assert.equal(orientationLabel(135), "zuidoost");
  assert.equal(orientationLabel(190), "zuid");
  assert.equal(orientationLabel(359), "noord");
});

test("longest-edge bearing follows the dominant footprint side", () => {
  // Rectangle 30 m wide (east-west) by 8 m deep, near lat 52.
  const width = 30 / (111_320 * Math.cos((52 * Math.PI) / 180));
  const depth = 8 / 111_320;
  const bearing = polygonLongestEdgeBearing({
    type: "Polygon",
    coordinates: [[[5.0, 52], [5.0 + width, 52], [5.0 + width, 52 + depth], [5.0, 52 + depth], [5.0, 52]]],
  });
  // The long edges run east-west; the axis bearing is ~90° or ~270° depending
  // on ring order — both mean facades face north/south.
  assert.ok(bearing != null);
  const normalized = ((bearing % 360) + 360) % 360;
  assert.ok(normalized > 60 && normalized < 120 || normalized > 240 && normalized < 300, `bearing ${bearing}`);
  assert.equal(polygonLongestEdgeBearing({ type: "Point", coordinates: [5, 52] }), null);
});
