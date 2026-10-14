// ヒットテスト（実装書 §3.8）。可視（オブジェクト visible・レイヤー visible・minS/maxS 内）かつ
// 非ロック（オブジェクト/レイヤーどちらもロックされていない）のオブジェクトを z 降順に走査し、
// 最初のヒットを返す。Pixi・DOM 非依存の純関数。
import type { BBox, Layer, MapObject, Point, ViewTransform } from "@mapcraft/shared";
import {
  bbox,
  CATALOG_BY_ID,
  distance,
  effectiveStyle,
  hitSegmentDistance,
  maybeSmooth,
  pointInPolygon,
} from "@mapcraft/shared";
import { getTextBounds } from "./textBoundsCache.js";

const TOL_PX = 6;

function isSelectable(obj: MapObject, layerMap: Map<string, Layer>, vtS: number): boolean {
  if (obj.locked) return false;
  if (obj.visible === false) return false;
  const layer = layerMap.get(obj.layerId);
  if (layer) {
    if (!layer.visible || layer.locked) return false;
    if (vtS < layer.minS || vtS > layer.maxS) return false;
  }
  return true;
}

// text: canvas/renderers/text.ts が Pixi Text.getLocalBounds() で実測して
// textBoundsCache に書き込んだ値を使う（実装書 §M6-2）。未レンダリング（テスト環境等）で
// キャッシュが無い場合のみ、文字数×fontSize からの見積もりにフォールバックする。
export function objectBBox(obj: MapObject): BBox {
  if (obj.pts && obj.pts.length > 0) return bbox(obj.pts);
  if (obj.pt) {
    if (obj.geom === "text") {
      const cached = getTextBounds(obj.id);
      const fontSize = obj.fontSize ?? 100;
      const halfW = cached?.halfW ?? Math.max(fontSize * 0.3, (obj.text?.length ?? 1) * fontSize * 0.3);
      const halfH = cached?.halfH ?? fontSize * 0.6;
      return {
        minX: obj.pt.x - halfW,
        minY: obj.pt.y - halfH,
        maxX: obj.pt.x + halfW,
        maxY: obj.pt.y + halfH,
      };
    }
    return bbox([obj.pt]);
  }
  return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

function bboxIntersects(a: BBox, b: BBox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function hitLine(world: Point, obj: MapObject, tol: number): boolean {
  if (!obj.pts || obj.pts.length === 0) return false;
  const style = effectiveStyle(obj, CATALOG_BY_ID);
  const dense = maybeSmooth(obj.pts, obj.geom, obj.mode);
  const hit = hitSegmentDistance(world, dense);
  return hit.d <= tol + (style.w ?? 2) / 2;
}

function hitAreaLike(world: Point, obj: MapObject, tol: number): boolean {
  if (!obj.pts || obj.pts.length === 0) return false;
  const style = effectiveStyle(obj, CATALOG_BY_ID);
  const dense = maybeSmooth(obj.pts, obj.geom, obj.mode);
  if (pointInPolygon(world, dense)) return true;
  const closed = dense.length > 0 ? [...dense, dense[0]!] : dense;
  const hit = hitSegmentDistance(world, closed);
  return hit.d <= tol + (style.sw ?? 1) / 2;
}

function hitRect(world: Point, obj: MapObject, tol: number): boolean {
  if (!obj.pts || obj.pts.length < 2) return false;
  const [a, b] = obj.pts;
  if (!a || !b) return false;
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return world.x >= minX - tol && world.x <= maxX + tol && world.y >= minY - tol && world.y <= maxY + tol;
}

function hitPoint(world: Point, obj: MapObject, vtS: number): boolean {
  if (!obj.pt) return false;
  const style = effectiveStyle(obj, CATALOG_BY_ID);
  const radius = ((style.size ?? 12) / 2 + 4) / vtS;
  return distance(world, obj.pt) <= radius;
}

function hitText(world: Point, obj: MapObject): boolean {
  if (!obj.pt) return false;
  const bb = objectBBox(obj);
  return world.x >= bb.minX && world.x <= bb.maxX && world.y >= bb.minY && world.y <= bb.maxY;
}

function hitObject(world: Point, obj: MapObject, tol: number, vtS: number): boolean {
  switch (obj.geom) {
    case "line":
      return hitLine(world, obj, tol);
    case "area":
    case "admin":
      return hitAreaLike(world, obj, tol);
    case "rect":
      return hitRect(world, obj, tol);
    case "point":
      return hitPoint(world, obj, vtS);
    case "text":
      return hitText(world, obj);
    default:
      return false;
  }
}

// 単一クリック選択用。z 降順に走査し最初のヒットを返す。
export function hitTest(world: Point, vt: ViewTransform, objects: MapObject[], layers: Layer[]): MapObject | null {
  const layerMap = new Map(layers.map((l) => [l.id, l]));
  const tol = TOL_PX / vt.s;
  const candidates = objects.filter((o) => isSelectable(o, layerMap, vt.s));
  candidates.sort((a, b) => (effectiveStyle(b, CATALOG_BY_ID).z ?? 0) - (effectiveStyle(a, CATALOG_BY_ID).z ?? 0));
  for (const obj of candidates) {
    if (hitObject(world, obj, tol, vt.s)) return obj;
  }
  return null;
}

// ラバーバンド矩形選択。bbox 交差で判定（ロック中・非表示は除外）。
export function hitTestRect(rect: BBox, vt: ViewTransform, objects: MapObject[], layers: Layer[]): MapObject[] {
  const layerMap = new Map(layers.map((l) => [l.id, l]));
  return objects.filter((o) => isSelectable(o, layerMap, vt.s) && bboxIntersects(objectBBox(o), rect));
}
