import assert from "node:assert/strict";
import test from "node:test";
import { pdokBagNearbyVboUrl } from "@/src/lib/sources/pdok/client";

test("nearby BAG URL uses a bounded bbox and caps the result count", () => {
  const url = new URL(pdokBagNearbyVboUrl({ lat: 52.3432, lng: 5.9787 }, 150, 500));
  const bbox = url.searchParams.get("bbox")?.split(",").map(Number) ?? [];

  assert.equal(url.pathname, "/kadaster/bag/ogc/v2/collections/verblijfsobject/items");
  assert.equal(url.searchParams.get("limit"), "100");
  assert.equal(bbox.length, 4);
  assert.ok(bbox[0] < 5.9787 && bbox[2] > 5.9787);
  assert.ok(bbox[1] < 52.3432 && bbox[3] > 52.3432);
});
