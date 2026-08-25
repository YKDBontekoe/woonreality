import { list } from "@vercel/blob";
import { fetchJson } from "@/src/lib/http/fetch-json";

export type ExtensionRelease = {
  version: string;
  releasedAt: string;
  chromeDownloadUrl: string;
  firefoxDownloadUrl: string;
  chromeSha256?: string;
  firefoxSha256?: string;
};

const releaseManifestPath = "extensions/latest.json";

export async function getLatestExtensionRelease(): Promise<ExtensionRelease | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;

  try {
    const { blobs } = await list({ prefix: releaseManifestPath, limit: 1 });
    const manifestBlob = blobs.find((blob) => blob.pathname === releaseManifestPath);
    if (!manifestBlob) return null;

    const release = await fetchJson<Partial<ExtensionRelease>>(manifestBlob.url, "Extension release manifest", { revalidate: 300 });
    if (!release.version || !release.releasedAt || !release.chromeDownloadUrl || !release.firefoxDownloadUrl) return null;

    return {
      version: release.version,
      releasedAt: release.releasedAt,
      chromeDownloadUrl: release.chromeDownloadUrl,
      firefoxDownloadUrl: release.firefoxDownloadUrl,
      chromeSha256: release.chromeSha256,
      firefoxSha256: release.firefoxSha256
    };
  } catch {
    return null;
  }
}
