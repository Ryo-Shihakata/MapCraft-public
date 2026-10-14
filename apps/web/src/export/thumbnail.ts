// サムネイル生成・アップロード（実装書 §M9-5）。全オブジェクト範囲・長辺640pxのPNGを
// 生成し POST /api/maps/:id/thumbnail する。EditorPage 側から「最後の編集から30秒後」
// または beforeunload 時に呼ばれる。
import type { PixiApp } from "../editor/canvas/PixiApp.js";
import { resolveExportBBox } from "./exportRange.js";

export const THUMBNAIL_LONG_EDGE_PX = 640;

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

// 全オブジェクト範囲＋余白5%を長辺640pxに収めたサムネイル PNG の Blob を返す。
// オブジェクトが1件も無い場合は null。
export async function generateThumbnailBlob(app: PixiApp): Promise<Blob | null> {
  const bbox = resolveExportBBox(app, "all");
  if (!bbox) return null;
  const w = Math.max(1e-6, bbox.maxX - bbox.minX);
  const h = Math.max(1e-6, bbox.maxY - bbox.minY);
  const pxPerMeter = THUMBNAIL_LONG_EDGE_PX / Math.max(w, h);
  const dataUrl = await app.exportRegionToDataUrl(bbox, pxPerMeter);
  return dataUrlToBlob(dataUrl);
}

export async function uploadThumbnail(mapId: string, blob: Blob): Promise<void> {
  await fetch(`/api/maps/${encodeURIComponent(mapId)}/thumbnail`, {
    method: "POST",
    headers: { "content-type": "image/png" },
    body: blob,
  });
}

// 生成→アップロードをまとめて行う。失敗しても呼び出し側（バックグラウンドトリガー）を
// 落とさないよう、ここで例外を握りつぶす（サムネイルはベストエフォート機能のため）。
export async function generateAndUploadThumbnail(app: PixiApp, mapId: string): Promise<void> {
  try {
    const blob = await generateThumbnailBlob(app);
    if (!blob) return;
    await uploadThumbnail(mapId, blob);
  } catch (e) {
    if (import.meta.env.DEV) console.warn("[thumbnail] generate/upload failed", e);
  }
}
