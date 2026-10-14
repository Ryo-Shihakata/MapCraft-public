// PNG エクスポート（実装書 §M9-2）。grid/overlay/preview の一時非表示・背景塗り・
// 復元は PixiApp.exportRegionToDataUrl が担う（Pixi 依存部分をレンダラ本体に閉じ込める）。
// 本モジュールは「倍率→pxPerMeter のクランプ」「ダウンロード起動」の薄いラッパー。
import type { BBox } from "@mapcraft/shared";
import type { PixiApp } from "../editor/canvas/PixiApp.js";
import { buildExportFilename, triggerDownload } from "./filename.js";

export const PNG_MAX_EDGE_PX = 8192;
export type PngMultiplier = 1 | 2 | 4;

// 出力辺が PNG_MAX_EDGE_PX を超えないよう pxPerMeter をクランプする。
export function clampPngPxPerMeter(bbox: BBox, basePxPerMeter: number, multiplier: PngMultiplier): number {
  const w = Math.max(1e-6, bbox.maxX - bbox.minX);
  const h = Math.max(1e-6, bbox.maxY - bbox.minY);
  const requested = basePxPerMeter * multiplier;
  const maxAllowed = PNG_MAX_EDGE_PX / Math.max(w, h);
  return Math.min(requested, maxAllowed);
}

export async function exportPng(
  app: PixiApp,
  bbox: BBox,
  pxPerMeter: number,
  mapName: string
): Promise<void> {
  const dataUrl = await app.exportRegionToDataUrl(bbox, pxPerMeter);
  triggerDownload(dataUrl, buildExportFilename(mapName, "png"));
}
