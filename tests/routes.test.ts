import assert from "node:assert/strict";
import test from "node:test";
import { GET as getHealth } from "@/app/api/health/route";
import { GET as searchAddresses } from "@/app/api/address/search/route";

test("health route reports the service as ready", async () => {
  const response = getHealth();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: "woonreality", version: "0.1.0" });
});

test("address search does not call external services for short queries", async () => {
  const response = await searchAddresses(new Request("http://localhost/api/address/search?q=ab"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { results: [] });
});
