import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type Server } from "node:http";
import { after, before } from "node:test";
import { SourceFetchError, fetchBuffer, fetchJson, fetchText } from "@/src/lib/http/fetch-json";

let server: Server;
let baseUrl = "";

before(async () => {
  server = createServer((request, response) => {
    if (request.url === "/json") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ hello: "world" }));
      return;
    }
    if (request.url === "/slow") {
      // Never responds; the client timeout must abort this request.
      return;
    }
    if (request.url === "/text") {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("plain body");
      return;
    }
    if (request.url === "/binary") {
      response.writeHead(200, { "content-type": "application/octet-stream" });
      response.end(Buffer.from([1, 2, 3]));
      return;
    }
    response.writeHead(404);
    response.end("nope");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("fetchJson parses JSON bodies", async () => {
  const payload = await fetchJson<{ hello: string }>(`${baseUrl}/json`, "Testbron", { timeoutMs: 2_000 });
  assert.equal(payload.hello, "world");
});

test("fetchJson throws a SourceFetchError carrying label and status — without the URL", async () => {
  await assert.rejects(
    () => fetchJson(`${baseUrl}/missing-secret-endpoint-42`, "Geheime bron", { timeoutMs: 2_000 }),
    (error: unknown) => {
      assert.ok(error instanceof SourceFetchError);
      assert.equal(error.label, "Geheime bron");
      assert.equal(error.status, 404);
      assert.ok(!error.message.includes("/missing-secret-endpoint-42"), "message must not leak the URL");
      assert.match(error.message, /HTTP 404/);
      return true;
    },
  );
});

test("fetchJson converts timeouts into a labelled time-out error", async () => {
  await assert.rejects(
    () => fetchJson(`${baseUrl}/slow`, "Trage bron", { timeoutMs: 50 }),
    (error: unknown) => {
      assert.ok(error instanceof SourceFetchError);
      assert.match(error.message, /time-out/);
      return true;
    },
  );
});

test("fetchText returns raw bodies and fetchBuffer raw bytes", async () => {
  assert.equal(await fetchText(`${baseUrl}/text`, "Tekstbron", { timeoutMs: 2_000 }), "plain body");
  const bytes = await fetchBuffer(`${baseUrl}/binary`, "Binaire bron", { timeoutMs: 2_000 });
  assert.deepEqual([...bytes], [1, 2, 3]);
});
