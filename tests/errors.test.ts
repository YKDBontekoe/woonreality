import assert from "node:assert/strict";
import test from "node:test";
import { redactError, toUserMessage, UserSafeError } from "../src/lib/errors";

test("toUserMessage returns fallback for ordinary Error messages", () => {
  assert.equal(toUserMessage(new Error("PDOK request failed https://api.pdok.nl/x"), "fallback"), "fallback");
  assert.equal(toUserMessage(new Error("something user-ish"), "fallback"), "fallback");
  assert.equal(toUserMessage("string", "fallback"), "fallback");
});

test("toUserMessage returns messages from UserSafeError", () => {
  assert.equal(toUserMessage(new UserSafeError("Dit adres bestaat niet."), "fallback"), "Dit adres bestaat niet.");
});

test("redactError strips URLs and secrets from log representations", () => {
  assert.match(redactError(new Error("failed https://example.com")), /redacted URL/);
  assert.match(redactError(new Error("missing EPONLINE_API_KEY")), /redacted secret/);
  assert.match(redactError(new Error("plain failure")), /plain failure/);
});
