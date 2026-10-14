import type { Point } from "../types.js";

// ─── ポリゴン系（pointInPolygon は v1 移植、centroid / bbox は M1 新規） ────────

// Ray casting による内外判定
export function pointInPolygon(p: Point, pts: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i]!.x,
      yi = pts[i]!.y;
    const xj = pts[j]!.x,
      yj = pts[j]!.y;
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// 面積重み付き重心（shoelace）。退化（面積 ≈ 0）時は頂点平均にフォールバック。
// ラベル配置（実装書 §M6: area/admin の中央ラベル）用。
export function polygonCentroid(pts: Point[]): Point {
  const n = pts.length;
  if (n === 0) return { x: 0, y: 0 };
  if (n < 3) {
    let sx = 0,
      sy = 0;
    for (const p of pts) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / n, y: sy / n };
  }
  let area2 = 0,
    cx = 0,
    cy = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const cross = pts[j]!.x * pts[i]!.y - pts[i]!.x * pts[j]!.y;
    area2 += cross;
    cx += (pts[j]!.x + pts[i]!.x) * cross;
    cy += (pts[j]!.y + pts[i]!.y) * cross;
  }
  if (Math.abs(area2) < 1e-9) {
    let sx = 0,
      sy = 0;
    for (const p of pts) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / n, y: sy / n };
  }
  return { x: cx / (3 * area2), y: cy / (3 * area2) };
}

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// 点列の外接矩形。空配列はゼロ矩形を返す（カリング側で「面積0=不可視」扱いにできる）。
export function bbox(pts: Point[]): BBox {
  if (pts.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = pts[0]!.x,
    minY = pts[0]!.y,
    maxX = pts[0]!.x,
    maxY = pts[0]!.y;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}
