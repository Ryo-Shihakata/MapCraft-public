// スナップ解決（実装書 §3.7）。shared の純関数（distance/gridInterval/snapToGrid/
// snapAngle/hitSegmentDistance）を組み合わせるだけの純関数。Pixi・DOM 非依存。
//
// 優先順位: ①頂点（既存オブジェクトの頂点。次いで線分上最近点） ②グリッド ③角度。
// 半径は screen 14px 固定（14 / vt.s を world 換算）を頂点・グリッド双方の
// 「吸着範囲」として使う。角度スナップは直前頂点からの方向ロックなので範囲を持たない
// （prevPoint がある限り、有効化されていれば常に適用される）。
import type { MapObject, Point, ViewTransform } from "@mapcraft/shared";
import { distance, gridInterval, hitSegmentDistance, snapAngle, snapToGrid } from "@mapcraft/shared";
import type { SnapConfig } from "../state/uiStore.js";

const SNAP_RADIUS_PX = 14;

export type SnapKind = "vertex" | "segment" | "grid" | "angle" | null;

export interface SnapResult {
  pt: Point;
  kind: SnapKind;
}

export interface SnapContext {
  vt: ViewTransform;
  objects: MapObject[];
  snapConfig: SnapConfig;
  // 描画中の直前頂点（角度スナップの基準点）。無ければ角度スナップは働かない。
  prevPoint?: Point | null;
}

function collectVertices(objects: MapObject[]): Point[] {
  const out: Point[] = [];
  for (const obj of objects) {
    if (obj.pts) out.push(...obj.pts);
    if (obj.pt) out.push(obj.pt);
  }
  return out;
}

function nearestVertex(cursor: Point, objects: MapObject[], radius: number): Point | null {
  let best: Point | null = null;
  let bestD = radius;
  for (const p of collectVertices(objects)) {
    const d = distance(cursor, p);
    if (d <= bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

// area/admin は閉路として扱い、終点→始点の辺も候補に含める。
function nearestOnSegments(cursor: Point, objects: MapObject[], radius: number): Point | null {
  let best: Point | null = null;
  let bestD = radius;
  for (const obj of objects) {
    if (!obj.pts || obj.pts.length < 2) continue;
    const closed = obj.geom === "area" || obj.geom === "admin";
    const pts = closed ? [...obj.pts, obj.pts[0]!] : obj.pts;
    const hit = hitSegmentDistance(cursor, pts);
    if (hit.d <= bestD) {
      bestD = hit.d;
      best = hit.pt;
    }
  }
  return best;
}

export function resolveSnap(cursor: Point, ctx: SnapContext): SnapResult {
  const radius = SNAP_RADIUS_PX / ctx.vt.s;

  if (ctx.snapConfig.vertex) {
    const v = nearestVertex(cursor, ctx.objects, radius);
    if (v) return { pt: v, kind: "vertex" };
    const s = nearestOnSegments(cursor, ctx.objects, radius);
    if (s) return { pt: s, kind: "segment" };
  }

  if (ctx.snapConfig.grid) {
    const interval = gridInterval(ctx.vt.s);
    const g = snapToGrid(cursor, interval);
    if (distance(cursor, g) <= radius) return { pt: g, kind: "grid" };
  }

  if (ctx.snapConfig.angle && ctx.prevPoint) {
    return { pt: snapAngle(ctx.prevPoint, cursor, ctx.snapConfig.angleDeg), kind: "angle" };
  }

  return { pt: cursor, kind: null };
}
