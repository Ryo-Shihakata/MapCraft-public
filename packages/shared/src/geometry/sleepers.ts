import type { Point } from "../types.js";
import { distance } from "./coords.js";

// ─── 鉄道の枕木生成（M1 新規） ────────────────────────────────────────────────
// ポリラインに沿って spacing（world m）間隔で、法線方向に長さ len（world m）の
// 短い線分を返す。呼び出し規約（実装書 §3.3）: spacing = w*3, len = w*2。
// 最初の枕木は spacing/2 の位置（端の見た目バランスのため）。

export function sleepers(pts: Point[], spacing: number, len: number): [Point, Point][] {
  if (spacing <= 0 || pts.length < 2) return [];

  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + distance(pts[i - 1]!, pts[i]!));
  const total = cum[cum.length - 1]!;
  if (total < 1e-9) return [];

  const out: [Point, Point][] = [];
  const half = len / 2;
  let seg = 1; // 現在の線分インデックス（cum[seg-1] <= d <= cum[seg]）

  for (let d = spacing / 2; d <= total; d += spacing) {
    while (seg < cum.length - 1 && cum[seg]! < d) seg++;
    const a = pts[seg - 1]!,
      b = pts[seg]!;
    const segLen = cum[seg]! - cum[seg - 1]!;
    if (segLen < 1e-9) continue;
    const t = (d - cum[seg - 1]!) / segLen;
    const cx = a.x + (b.x - a.x) * t;
    const cy = a.y + (b.y - a.y) * t;
    // 単位接線 → 法線（-uy, ux）
    const ux = (b.x - a.x) / segLen;
    const uy = (b.y - a.y) / segLen;
    const nx = -uy,
      ny = ux;
    out.push([
      { x: cx - nx * half, y: cy - ny * half },
      { x: cx + nx * half, y: cy + ny * half },
    ]);
  }
  return out;
}
