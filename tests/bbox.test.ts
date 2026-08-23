import assert from "node:assert/strict";
import test from "node:test";
import { bboxAround, bboxString } from "@/src/lib/geo/bbox";

const EPE_CENTER = { lat: 52.348, lng: 5.985 };

test("bboxAround returns west-south-east-north around the center at low latitudes", () => {
  const [west, south, east, north] = bboxAround(EPE_CENTER, 250);
  assert.ok(west < EPE_CENTER.lng && east > EPE_CENTER.lng, "longitude range must straddle the center");
  assert.ok(south < EPE_CENTER.lat && north > EPE_CENTER.lat, "latitude range must straddle the center");
  // 250 m ≈ 0.00225° latitude anywhere in NL.
  assert.ok(Math.abs((north - south) - 500 / 111_320) < 1e-9);
});

test("bboxAround keeps the physical east-west span near 2·radiusM across latitudes", () => {
  const physicalWidthM = (value: string, lat: number) => {
    const [w, , e] = value.split(",").map(Number);
    return (e - w) * 111_320 * Math.cos((lat * Math.PI) / 180);
  };
  // Degree width grows with 1/cos(lat); the physical span must stay ~500 m.
  assert.ok(Math.abs(physicalWidthM(bboxString({ lat: 0, lng: 5 }, 250), 0) - 500) < 1);
  assert.ok(Math.abs(physicalWidthM(bboxString({ lat: 53.5, lng: 5 }, 250), 53.5) - 500) < 1);
});

test("bboxString joins with commas for PDOK-style bbox parameters", () => {
  const value = bboxString({ lat: 52, lng: 4 }, 100);
  assert.match(value, /^[^,]+,[^,]+,[^,]+,[^,]+$/);
});
