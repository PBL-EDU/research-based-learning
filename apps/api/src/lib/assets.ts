import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isAllowedAssetMime, type AssetMime } from "@rlc/contract";

export interface StoredAsset {
  storageKey: string;
  mime: AssetMime;
  bytes: number;
  sha256: string;
}

function safeName(filename: string): string {
  return path.basename(filename).replace(/[^\w.\-\u4e00-\u9fa5]/g, "_").slice(0, 120);
}

/**
 * 把上传的图片落到本地磁盘。
 *
 * P0 用本地目录而不是 MinIO：单机能跑、备份就是 tar 一个目录。
 * `${dataDir}/assets/<publicationId>/<revision>/<filename>` 同时也是公开 URL 的路径。
 */
export async function saveAsset(input: {
  dataDir: string;
  publicationId: string;
  revision: number;
  filename: string;
  mime: string;
  buffer: Buffer;
}): Promise<StoredAsset> {
  if (!isAllowedAssetMime(input.mime)) {
    throw new Error(`不支持的资产类型：${input.mime}`);
  }

  const folder = path.join(input.dataDir, "assets", input.publicationId, String(input.revision));
  await mkdir(folder, { recursive: true });

  const name = safeName(input.filename);
  await writeFile(path.join(folder, name), input.buffer);

  return {
    storageKey: `${input.publicationId}/${input.revision}/${name}`,
    mime: input.mime,
    bytes: input.buffer.byteLength,
    sha256: `sha256:${createHash("sha256").update(input.buffer).digest("hex")}`,
  };
}

export function assetUrl(publicBaseUrl: string, storageKey: string): string {
  return `${publicBaseUrl}/assets/${storageKey}`;
}
