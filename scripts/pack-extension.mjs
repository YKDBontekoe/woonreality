import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import * as esbuild from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const extDir = join(root, "extensions/woonreality-funda");
const publicDir = join(root, "public/extension");
const ICON_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA" +
  "gklEQVR4nO3PMQ0AIAwEwZQGJCEBCah/wYEEJNjM3eX2zMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzM" +
  "zMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzM" +
  "zMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMz8/gGbKgS5iV6nWwAAAABJRU5ErkJggg==",
  "base64",
);

function crc32(buffer) {
  let crc = ~0;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return ~crc >>> 0;
}

function zipStore(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const data = Buffer.from(file.data);
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const localPart = Buffer.concat([local, name, compressed]);
    chunks.push(localPart);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0, 8);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt32LE(0, 12);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(compressed.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt16LE(0, 30);
    dir.writeUInt16LE(0, 32);
    dir.writeUInt16LE(0, 34);
    dir.writeUInt16LE(0, 36);
    dir.writeUInt32LE(0, 38);
    dir.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([dir, name]));
    offset += localPart.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, centralBuf, end]);
}

async function bundle() {
  const dist = join(extDir, "dist");
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  await esbuild.build({
    absWorkingDir: root,
    entryPoints: {
      background: join(extDir, "src/background.ts"),
      content: join(extDir, "src/content.ts"),
      pair: join(extDir, "src/pair.ts"),
      popup: join(extDir, "src/popup.ts"),
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome114", "firefox121"],
    outdir: dist,
    alias: { "@": root },
    logLevel: "info",
  });
  await writeFile(join(dist, "popup.html"), await readFile(join(extDir, "src/popup.html")));
  await writeFile(join(dist, "icon48.png"), ICON_PNG);
  return dist;
}

async function packBrowser(dist, manifestName, outName) {
  const manifest = await readFile(join(extDir, manifestName));
  const names = ["background.js", "content.js", "pair.js", "popup.js", "popup.html", "icon48.png"];
  const files = [{ name: "manifest.json", data: manifest }];
  for (const name of names) {
    files.push({ name, data: await readFile(join(dist, name)) });
  }
  const archive = zipStore(files);
  await mkdir(publicDir, { recursive: true });
  const outPath = join(publicDir, outName);
  await writeFile(outPath, archive);
  return { outPath, sha256: createHash("sha256").update(archive).digest("hex"), bytes: archive.length };
}

async function main() {
  const dist = await bundle();
  const chrome = await packBrowser(dist, "manifest.chrome.json", "woonreality-funda-chrome.zip");
  const firefox = await packBrowser(dist, "manifest.firefox.json", "woonreality-funda-firefox.xpi");
  const version = JSON.parse(await readFile(join(extDir, "manifest.chrome.json"), "utf8")).version;
  const meta = {
    version,
    parserVersion: 1,
    sha256Chrome: chrome.sha256,
    sha256Firefox: firefox.sha256,
    publishedAt: new Date().toISOString(),
  };
  await writeFile(join(publicDir, "version.json"), `${JSON.stringify(meta, null, 2)}\n`);
  await writeFile(join(publicDir, "README.md"), `# WoonReality Funda-extensie

Download \`woonreality-funda-chrome.zip\` of \`woonreality-funda-firefox.xpi\` vanaf \`/extensie\`.
Deze bestanden worden bij \`npm run build\` / \`npm run extension:pack\` opnieuw gemaakt.
`);
  console.log(`Packed Chrome ${chrome.bytes} bytes and Firefox ${firefox.bytes} bytes (v${version}).`);
}

await main();
