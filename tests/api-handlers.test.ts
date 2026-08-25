import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { jsonError, parseJsonBody, privateHeaders } from "@/src/lib/api/handlers";

test("jsonError wraps the message with the status code", async () => {
  const response = jsonError("niet gevonden", 404);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "niet gevonden" });
});

test("jsonError supports extra headers", () => {
  const response = jsonError("nee", 401, privateHeaders());
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
});

test("parseJsonBody validates against the schema", async () => {
  const schema = z.object({ stage: z.string() });
  const request = new Request("http://localhost/api/test", {
    method: "POST",
    body: JSON.stringify({ stage: "offer" }),
    headers: { "content-type": "application/json" },
  });
  const result = await parseJsonBody(request, schema, "ongeldig");
  assert.ok(result.ok);
  assert.deepEqual(result.data, { stage: "offer" });
});

test("parseJsonBody rejects invalid payloads and malformed JSON with a 400 response", async () => {
  const schema = z.object({ stage: z.string() });
  const invalid = await parseJsonBody(
    new Request("http://localhost/api/test", { method: "POST", body: JSON.stringify({ stage: 5 }) }),
    schema,
    "ongeldig",
  );
  assert.ok(!invalid.ok);
  assert.equal(invalid.response.status, 400);
  assert.deepEqual(await invalid.response.json(), { error: "ongeldig" });

  const malformed = await parseJsonBody(
    new Request("http://localhost/api/test", { method: "POST", body: "not-json" }),
    schema,
    "ongeldig",
  );
  assert.ok(!malformed.ok);
  assert.equal(malformed.response.status, 400);
});
