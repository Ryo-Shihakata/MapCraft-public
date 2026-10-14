// 選択ツールの純粋ロジック（実装書 §M5-2）。クリック選択・ラバーバンド・移動・ナッジ・
// 削除の「MapDoc/uiStore への反映」を担う。ポインタ/キーイベントの実受信・ドラッグ中の
// 一時状態（rubberBand の始点など）は ToolManager が持つ（drawTool と同じ役割分担）。
import type { BBox, Layer, MapObject, Point } from "@mapcraft/shared";
import type { MapDoc } from "../doc/MapDoc.js";
import { hitTestRect, objectBBox } from "./hitTest.js";

// overlayLayer（canvas/overlay.ts）へ渡す選択オーバーレイの状態。canvas/ は tools/ に
// 依存してよいが逆方向は禁止（実装書 §1 のディレクトリ構成）なので、この型は tools/ 側に置く。
export interface SelectionOverlayState {
  selected: MapObject[];
  // 単一選択かつ頂点編集可能な geom の場合のみセットされる（複数選択時は null）。
  vertexEditTarget: MapObject | null;
  selectedVertexIndex: number | null;
  // ラバーバンドドラッグ中の矩形（world 座標の対角2点）。
  rubberBand: { a: Point; b: Point } | null;
}

// 単一/複数オブジェクトの結合 world bbox（overlay の選択枠描画用）。
export function combinedBBox(objects: MapObject[]): BBox | null {
  if (objects.length === 0) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const obj of objects) {
    const bb = objectBBox(obj);
    if (bb.minX < minX) minX = bb.minX;
    if (bb.minY < minY) minY = bb.minY;
    if (bb.maxX > maxX) maxX = bb.maxX;
    if (bb.maxY > maxY) maxY = bb.maxY;
  }
  return { minX, minY, maxX, maxY };
}

// Shift+クリックのトグル追加。
export function toggleSelection(selectedIds: string[], id: string): string[] {
  return selectedIds.includes(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id];
}

// ラバーバンド矩形選択（bbox交差）。
export function rubberBandSelect(
  rectA: Point,
  rectB: Point,
  vt: { x: number; y: number; s: number },
  objects: MapObject[],
  layers: Layer[]
): string[] {
  const rect: BBox = {
    minX: Math.min(rectA.x, rectB.x),
    minY: Math.min(rectA.y, rectB.y),
    maxX: Math.max(rectA.x, rectB.x),
    maxY: Math.max(rectA.y, rectB.y),
  };
  return hitTestRect(rect, vt, objects, layers).map((o) => o.id);
}

function translatePoint(p: Point, dx: number, dy: number): Point {
  return { x: p.x + dx, y: p.y + dy };
}

// 選択オブジェクト一括移動（pts/pt を dx,dy 平行移動）。ロック中オブジェクトはスキップする
// （選択に紛れ込んでいた場合の保険。通常は hitTest 段階で除外済み）。
export function translateObjects(mapDoc: MapDoc, objects: MapObject[], dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  mapDoc.transact(() => {
    for (const obj of objects) {
      if (obj.locked) continue;
      const patch: Partial<MapObject> = {};
      if (obj.pts) patch.pts = obj.pts.map((p) => translatePoint(p, dx, dy));
      if (obj.pt) patch.pt = translatePoint(obj.pt, dx, dy);
      mapDoc.updateObject(obj.id, patch);
    }
  });
}

// 1ドラッグ/1ナッジ = 1 undo 単位にするための境界。呼び出し側（ToolManager）が
// 操作確定のたびに呼ぶ（drawTool.commitObject と同じ理由。実装書 §M4/§M5）。
export function commitMoveBoundary(mapDoc: MapDoc): void {
  mapDoc.undo.stopCapturing();
}

export function deleteObjects(mapDoc: MapDoc, ids: string[]): void {
  if (ids.length === 0) return;
  mapDoc.deleteObjects(ids);
  mapDoc.undo.stopCapturing();
}

// 掴んだスクリーン座標に最も近い、選択オブジェクト群の頂点（移動時のスナップ基準点）。
export function nearestGrabVertex(grab: Point, objects: MapObject[]): Point | null {
  let best: Point | null = null;
  let bestD = Infinity;
  for (const obj of objects) {
    const pts = obj.pts ?? (obj.pt ? [obj.pt] : []);
    for (const p of pts) {
      const d = (p.x - grab.x) ** 2 + (p.y - grab.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return best;
}
