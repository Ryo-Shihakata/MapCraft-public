// エクスポート範囲の解決（実装書 §M9-1）。「現在のビュー」または
// 「全オブジェクト＋余白5%」を world bbox として返す純粋なヘルパー。
import type { BBox } from "@mapcraft/shared";
import type { PixiApp } from "../editor/canvas/PixiApp.js";

export type ExportRangeMode = "view" | "all";

const ALL_OBJECTS_MARGIN_RATIO = 0.05;

export function expandBBox(bbox: BBox, marginRatio: number): BBox {
  const w = bbox.maxX - bbox.minX;
  const h = bbox.maxY - bbox.minY;
  const mx = w * marginRatio;
  const my = h * marginRatio;
  return { minX: bbox.minX - mx, minY: bbox.minY - my, maxX: bbox.maxX + mx, maxY: bbox.maxY + my };
}

// 範囲を解決する。「全オブジェクト」でオブジェクトが1件も無ければ null（呼び出し側でエラー表示）。
export function resolveExportBBox(app: PixiApp, mode: ExportRangeMode): BBox | null {
  if (mode === "view") return app.getCurrentViewWorldBBox();
  const all = app.getAllObjectsWorldBBox();
  if (!all) return null;
  return expandBBox(all, ALL_OBJECTS_MARGIN_RATIO);
}
