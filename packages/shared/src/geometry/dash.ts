import type { Point } from "../types.js";
import { distance } from "./coords.js";

// ─── 破線分解（M1 新規） ──────────────────────────────────────────────────────
// Pixi v8 に破線 stroke が無いため、ポリラインを [on, off]（world m）の
// 「on 区間」のサブポリライン列に分解して描画する。SVG 出力側は native の
// stroke-dasharray を使うので本関数は Pixi レンダラ専用だが、純関数として共有に置く。

// 累積距離 cum 上の距離 d に対応する点を返す（d は [0, total] にクランプ済み前提）
function pointAt(pts: Point[], cum: number[], d: number): Point {
  for (let i = 1; i < cum.length; i++) {
    if (d <= cum[i]!) {
      const segLen = cum[i]! - cum[i - 1]!;
      if (segLen < 1e-9) return { ...pts[i]! };
      const t = (d - cum[i - 1]!) / segLen;
      const a = pts[i - 1]!,
        b = pts[i]!;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }
  return { ...pts[pts.length - 1]! };
}

// 距離区間 [s, e] のサブポリラインを抽出（途中の頂点も含める）
function slicePath(pts: Point[], cum: number[], s: number, e: number): Point[] {
  const out: Point[] = [pointAt(pts, cum, s)];
  for (let i = 1; i < cum.length - 1; i++) {
    if (cum[i]! > s && cum[i]! < e) out.push({ ...pts[i]! });
  }
  out.push(pointAt(pts, cum, e));
  return out;
}

export function dashSegments(pts: Point[], dash: [number, number]): Point[][] {
  const [on, off] = dash;
  if (on <= 0 || pts.length < 2) return [];

  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + distance(pts[i - 1]!, pts[i]!));
  const total = cum[cum.length - 1]!;
  if (total < 1e-9) return [];

  const period = on + Math.max(0, off);
  const out: Point[][] = [];
  for (let s = 0; s < total; s += period) {
    const e = Math.min(s + on, total);
    if (e - s > 1e-9) out.push(slicePath(pts, cum, s, e));
  }
  return out;
}
