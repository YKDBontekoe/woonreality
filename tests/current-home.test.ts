import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCurrentHome, scoreDelta } from "../src/lib/current-home";
import { workspaceBodySchema } from "../src/lib/validation/workspace";

test("parseCurrentHome accepts a complete stored record", () => {
  const home = parseCurrentHome({
    bagVboId: "0232010000003562",
    addressLabel: "Korenstraat 18",
    city: "Epe",
    postcode: "8161EA",
    savedAt: "2026-08-25T10:00:00.000Z",
    askingPrice: 425000,
  });
  assert.equal(home?.bagVboId, "0232010000003562");
  assert.equal(home?.city, "Epe");
  assert.equal(home?.askingPrice, 425000);
});

test("parseCurrentHome fills optional fields and rejects corrupt records", () => {
  const minimal = parseCurrentHome({ bagVboId: "0232010000003562", addressLabel: "Korenstraat 18" });
  assert.equal(minimal?.city, "");
  assert.equal(minimal?.postcode, "");
  assert.ok(minimal?.savedAt);

  assert.equal(parseCurrentHome(null), null);
  assert.equal(parseCurrentHome("woning"), null);
  assert.equal(parseCurrentHome([]), null);
  assert.equal(parseCurrentHome({}), null);
  assert.equal(parseCurrentHome({ addressLabel: "Zonder bag id" }), null);
  assert.equal(parseCurrentHome({ bagVboId: "1234", addressLabel: "Te kort id" }), null);
  assert.equal(parseCurrentHome({ bagVboId: "0232010000003562", addressLabel: "  " }), null);
  assert.equal(parseCurrentHome({ bagVboId: "0232010000003562", addressLabel: "X", askingPrice: -5 })?.askingPrice, null);
  assert.equal(parseCurrentHome({ bagVboId: "0232010000003562", addressLabel: "X", askingPrice: "veel" })?.askingPrice, null);
});

test("parseCurrentHome treats the cleared marker as no current home", () => {
  assert.equal(parseCurrentHome({}), null);
});

test("scoreDelta rounds to one decimal", () => {
  assert.equal(scoreDelta(7.2, 8.4), 1.2);
  assert.equal(scoreDelta(7.2, 6.9), -0.3);
  assert.equal(scoreDelta(7.2, 7.3), 0.1);
  assert.equal(scoreDelta(5, 5), 0);
});

test("workspace schema validates current-home actions strictly", () => {
  assert.equal(workspaceBodySchema.safeParse({
    action: "setCurrentHome",
    bagVboId: "0232010000003562",
    addressLabel: "Korenstraat 18",
    city: "Epe",
    postcode: "8161EA",
  }).success, true);

  assert.equal(workspaceBodySchema.safeParse({
    action: "setCurrentHome",
    bagVboId: "0232010000003562",
    addressLabel: "Korenstraat 18",
    city: "Epe",
    postcode: "8161EA",
    askingPrice: 1,
  }).success, false);

  assert.equal(workspaceBodySchema.safeParse({
    action: "setCurrentHome",
    bagVboId: "geen-bag-id",
    addressLabel: "Korenstraat 18",
    city: "Epe",
    postcode: "8161EA",
  }).success, false);

  assert.equal(workspaceBodySchema.safeParse({ action: "clearCurrentHome" }).success, true);
  assert.equal(workspaceBodySchema.safeParse({ action: "clearCurrentHome", bagVboId: "0232010000003562" }).success, false);
});
