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
  const withUrl = redactError(new Error("failed https://example.com/secret-path"));
  assert.match(withUrl, /redacted URL/);
  assert.equal(withUrl.includes("https://example.com"), false);

  const withKey = redactError(new Error("missing EPONLINE_API_KEY in env"));
  assert.match(withKey, /redacted secret/);
  assert.equal(withKey.includes("EPONLINE_API_KEY"), false);

  const plain = redactError(new Error("plain failure"));
  assert.match(plain, /plain failure/);
});

test("redactError stringifies non-Error inputs", () => {
  assert.equal(redactError("not-an-error"), "not-an-error");
  assert.equal(redactError(42), "42");
});
