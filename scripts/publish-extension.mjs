import { put } from "@vercel/blob";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(projectRoot, "public", "extension");

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  throw new Error("BLOB_READ_WRITE_TOKEN is required to publish the extension.");
}

execFileSync(process.env.npm_execpath ?? "npm", ["run", "extension:pack"], { cwd: projectRoot, stdio: "inherit" });

const chromePath = join(publicDir, "woonreality-funda-chrome.zip");
const firefoxPath = join(publicDir, "woonreality-funda-firefox.xpi");
const release = JSON.parse(await readFile(join(publicDir, "version.json"), "utf8"));
const chrome = await readFile(chromePath);
const firefox = await readFile(firefoxPath);
const commonOptions = {
  access: "public",
  addRandomSuffix: false,
  allowOverwrite: true,
  token: process.env.BLOB_READ_WRITE_TOKEN
};

const versionedChrome = await put(`extensions/woonreality-funda-${release.version}-chrome.zip`, chrome, {
  ...commonOptions,
  contentType: "application/zip",
  cacheControlMaxAge: 31536000
});
const versionedFirefox = await put(`extensions/woonreality-funda-${release.version}-firefox.xpi`, firefox, {
  ...commonOptions,
  contentType: "application/x-xpinstall",
  cacheControlMaxAge: 31536000
});
const latestChrome = await put("extensions/woonreality-funda-latest-chrome.zip", chrome, {
  ...commonOptions,
  contentType: "application/zip",
  cacheControlMaxAge: 300
});
const latestFirefox = await put("extensions/woonreality-funda-latest-firefox.xpi", firefox, {
  ...commonOptions,
  contentType: "application/x-xpinstall",
  cacheControlMaxAge: 300
});
const manifest = {
  version: release.version,
  releasedAt: release.publishedAt,
  chromeDownloadUrl: latestChrome.url,
  firefoxDownloadUrl: latestFirefox.url,
  chromeVersionedDownloadUrl: versionedChrome.url,
  firefoxVersionedDownloadUrl: versionedFirefox.url,
  chromeSha256: createHash("sha256").update(chrome).digest("hex"),
  firefoxSha256: createHash("sha256").update(firefox).digest("hex")
};

await put("extensions/latest.json", JSON.stringify(manifest, null, 2), {
  access: "public",
  addRandomSuffix: false,
  allowOverwrite: true,
  contentType: "application/json",
  cacheControlMaxAge: 300,
  token: process.env.BLOB_READ_WRITE_TOKEN
});

console.log(`Published WoonReality Funda extension ${release.version} to Vercel Blob.`);
