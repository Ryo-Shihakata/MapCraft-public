import type { Geom, Point } from "../types.js";

// ─── 曲線平滑化（Catmull-Rom スプライン。v1 coords.ts から移植） ────────────────
// mode === "curve" のオブジェクトの頂点列を密化する。closed は面境界用。

export function catmullRom(pts: Point[], segments = 16, closed = false): Point[] {
  const n = pts.length;
  if (n < 3) return pts.map((p) => ({ ...p }));

  const out: Point[] = [];
  const last = closed ? n : n - 1;

  for (let i = 0; i < last; i++) {
    const p0 = pts[(i - 1 + n) % n]!;
    const p1 = pts[i % n]!;
    const p2 = pts[(i + 1) % n]!;
    const p3 = pts[(i + 2) % n]!;

    // 開いたパスでは端の仮想制御点を端点にクランプする
    const c0 = !closed && i === 0 ? p1 : p0;
    const c3 = !closed && i === last - 1 ? p2 : p3;

    for (let j = 0; j < segments; j++) {
      const t = j / segments;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x:
          0.5 *
          (2 * p1.x +
            (-c0.x + p2.x) * t +
            (2 * c0.x - 5 * p1.x + 4 * p2.x - c3.x) * t2 +
            (-c0.x + 3 * p1.x - 3 * p2.x + c3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (-c0.y + p2.y) * t +
            (2 * c0.y - 5 * p1.y + 4 * p2.y - c3.y) * t2 +
            (-c0.y + 3 * p1.y - 3 * p2.y + c3.y) * t3),
      });
    }
  }
  // 終端頂点を追加（開）またはループを閉じる（閉）
  out.push(closed ? { ...pts[0]! } : { ...pts[n - 1]! });
  return out;
}

// mode === "curve" のときだけ平滑化した点列を返す。
// rect / point / text は平滑化しない。area / admin は閉スプライン、line は開スプライン。
export function maybeSmooth(
  pts: Point[],
  geom: Geom,
  mode: "straight" | "curve" | undefined
): Point[] {
  if (mode !== "curve" || geom === "rect" || geom === "point" || geom === "text" || pts.length < 3)
    return pts;
  return catmullRom(pts, 16, geom === "area" || geom === "admin");
}
