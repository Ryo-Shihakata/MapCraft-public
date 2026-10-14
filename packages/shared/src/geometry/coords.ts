import type { Point, ViewTransform } from "../types.js";

// ─── 座標変換（v1 coords.ts から移植） ─────────────────────────────────────────

// Screen → World
export function screenToWorld(sx: number, sy: number, vt: ViewTransform): Point {
  return {
    x: (sx - vt.x) / vt.s,
    y: (sy - vt.y) / vt.s,
  };
}

// World → Screen
export function worldToScreen(wx: number, wy: number, vt: ViewTransform): Point {
  return {
    x: wx * vt.s + vt.x,
    y: wy * vt.s + vt.y,
  };
}

export function distance(a: Point, b: Point): number {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// 点 p から線分 a→b 上の最近点とその距離
export function closestOnSegment(p: Point, a: Point, b: Point): { pt: Point; d: number } {
  const abx = b.x - a.x,
    aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-9) return { pt: { ...a }, d: distance(p, a) };
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
  const pt = { x: a.x + t * abx, y: a.y + t * aby };
  return { pt, d: distance(p, pt) };
}

// 点 p からポリライン pts の最近線分距離（ヒットテスト用。closestOnSegment ベース）
// index は最近傍だった線分の始点インデックス（pts が1点のみなら 0、空なら -1）
export function hitSegmentDistance(
  p: Point,
  pts: Point[]
): { d: number; index: number; pt: Point } {
  if (pts.length === 0) return { d: Infinity, index: -1, pt: { ...p } };
  if (pts.length === 1) return { d: distance(p, pts[0]!), index: 0, pt: { ...pts[0]! } };
  let best = { d: Infinity, index: 0, pt: { ...pts[0]! } };
  for (let i = 0; i < pts.length - 1; i++) {
    const c = closestOnSegment(p, pts[i]!, pts[i + 1]!);
    if (c.d < best.d) best = { d: c.d, index: i, pt: c.pt };
  }
  return best;
}

// ─── 縮尺表記（96dpi 前提。v1 から移植） ──────────────────────────────────────
// s = screen px / m。1px = 0.0254/96 m なので縮尺 = 96 / (0.0254 * s)
const SCREEN_DPI = 96;
const METRES_PER_INCH = 0.0254;

export function scaleToRatio(s: number): string {
  if (s <= 0) return "1:∞";
  const ratio = Math.round(SCREEN_DPI / (METRES_PER_INCH * s));
  return `1:${ratio.toLocaleString()}`;
}
