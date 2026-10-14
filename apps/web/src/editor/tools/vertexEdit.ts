// 頂点編集の純粋ロジック（実装書 §M5-3）。単一の line/area/admin/rect 選択時に有効。
// ハンドルは常に「元の pts（制御点）」に対して操作する。curve モードの表示は密化後だが、
// ハンドル自体は制御点のまま（実装書 §M5-3 curve 注記）。
import type { MapObject, Point, ViewTransform } from "@mapcraft/shared";
import { closestOnSegment, worldToScreen } from "@mapcraft/shared";
import type { MapDoc } from "../doc/MapDoc.js";

const HANDLE_RADIUS_PX = 8;

// 頂点編集の対象となる geom。point/text/line未満の頂点数は対象外。
export function isVertexEditable(obj: MapObject): boolean {
  return (obj.geom === "line" || obj.geom === "area" || obj.geom === "admin" || obj.geom === "rect") &&
    !!obj.pts &&
    obj.pts.length > 0;
}

// スクリーン座標が、いずれかのハンドル（8px四方）に乗っているか。乗っていればその index。
export function findHandleIndex(screenCursor: Point, obj: MapObject, vt: ViewTransform): number | null {
  if (!obj.pts) return null;
  for (let i = 0; i < obj.pts.length; i++) {
    const s = worldToScreen(obj.pts[i]!.x, obj.pts[i]!.y, vt);
    if (Math.abs(s.x - screenCursor.x) <= HANDLE_RADIUS_PX && Math.abs(s.y - screenCursor.y) <= HANDLE_RADIUS_PX) {
      return i;
    }
  }
  return null;
}

// Alt+クリック挿入位置の探索。制御点の線分列（area/admin は閉路）から最近点を探し、
// tol 以内ならその線分の直後に挿入する index と挿入座標を返す。
export function findInsertion(
  world: Point,
  obj: MapObject,
  tol: number
): { index: number; pt: Point } | null {
  if (!obj.pts || obj.pts.length < 2) return null;
  const closed = obj.geom === "area" || obj.geom === "admin";
  const n = obj.pts.length;
  const segCount = closed ? n : n - 1;
  let best: { index: number; pt: Point; d: number } | null = null;
  for (let i = 0; i < segCount; i++) {
    const a = obj.pts[i]!;
    const b = obj.pts[(i + 1) % n]!;
    const c = closestOnSegment(world, a, b);
    if (!best || c.d < best.d) best = { index: i, pt: c.pt, d: c.d };
  }
  if (!best || best.d > tol) return null;
  return { index: best.index, pt: best.pt };
}

// ハンドルドラッグによる頂点移動（スナップ適用済みの newPt を渡す）。
export function moveVertex(mapDoc: MapDoc, obj: MapObject, index: number, newPt: Point): void {
  if (!obj.pts || index < 0 || index >= obj.pts.length) return;
  const pts = obj.pts.map((p, i) => (i === index ? newPt : p));
  mapDoc.updateObject(obj.id, { pts });
}

export function insertVertex(mapDoc: MapDoc, obj: MapObject, index: number, pt: Point): void {
  if (!obj.pts) return;
  const pts = [...obj.pts.slice(0, index + 1), pt, ...obj.pts.slice(index + 1)];
  mapDoc.updateObject(obj.id, { pts });
  mapDoc.undo.stopCapturing();
}

// 頂点削除。下限ガード: line>=2 / area・admin>=3。rect は頂点削除不可（対角リサイズのみ）。
// 削除できたら true を返す。
export function deleteVertex(mapDoc: MapDoc, obj: MapObject, index: number): boolean {
  if (!obj.pts) return false;
  if (obj.geom === "rect") return false;
  const minCount = obj.geom === "line" ? 2 : 3;
  if (obj.pts.length <= minCount) return false;
  const pts = obj.pts.filter((_, i) => i !== index);
  mapDoc.updateObject(obj.id, { pts });
  mapDoc.undo.stopCapturing();
  return true;
}

// Alt+クリック挿入判定の world 許容誤差(screen px → world)。
export function insertionTolerance(vt: ViewTransform, px = 8): number {
  return px / vt.s;
}
