import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.join(process.cwd(), "messages");

function flatten(value: unknown, prefix = ""): string[] {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key));
  }
  return [prefix];
}

function keysOf(locale: string, file: string) {
  return new Set(flatten(JSON.parse(readFileSync(path.join(root, locale, file), "utf8"))));
}

test("nl and en catalogs have the same namespaces", () => {
  assert.deepEqual(readdirSync(path.join(root, "nl")).sort(), readdirSync(path.join(root, "en")).sort());
});

for (const file of readdirSync(path.join(root, "nl"))) {
  test(`nl and en keys match in ${file}`, () => {
    const nl = keysOf("nl", file);
    const en = keysOf("en", file);
    assert.deepEqual([...nl].filter((key) => !en.has(key)), [], `missing in en/${file}`);
    assert.deepEqual([...en].filter((key) => !nl.has(key)), [], `missing in nl/${file}`);
  });
}
