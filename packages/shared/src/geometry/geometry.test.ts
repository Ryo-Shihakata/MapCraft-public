import { describe, expect, it } from "vitest";
import type { Point, ViewTransform } from "../types.js";
import {
  bbox,
  catmullRom,
  closestOnSegment,
  dashSegments,
  distance,
  gridInterval,
  hitSegmentDistance,
  maybeSmooth,
  pointInPolygon,
  polygonCentroid,
  scaleToRatio,
  screenToWorld,
  sleepers,
  snapAngle,
  snapToGrid,
  worldToScreen,
} from "./index.js";

function pathLength(pts: Point[]): number {
  let sum = 0;
  for (let i = 1; i < pts.length; i++) sum += distance(pts[i - 1]!, pts[i]!);
  return sum;
}

describe("coords", () => {
  it("screenToWorld ∘ worldToScreen = id（往復変換）", () => {
    const vts: ViewTransform[] = [
      { x: 500, y: 350, s: 0.1 },
      { x: -120.5, y: 42, s: 7.25 },
      { x: 0, y: 0, s: 1 },
    ];
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 1234.5, y: -678.9 },
      { x: -0.001, y: 99999 },
    ];
    for (const vt of vts) {
      for (const p of pts) {
        const s = worldToScreen(p.x, p.y, vt);
        const w = screenToWorld(s.x, s.y, vt);
        expect(w.x).toBeCloseTo(p.x, 6);
        expect(w.y).toBeCloseTo(p.y, 6);
      }
    }
  });

  it("worldToScreen の既知値（screen = world*s + (x,y)）", () => {
    const vt: ViewTransform = { x: 100, y: 50, s: 2 };
    expect(worldToScreen(10, -20, vt)).toEqual({ x: 120, y: 10 });
  });

  it("distance の代表値", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(distance({ x: 1, y: 1 }, { x: 1, y: 1 })).toBe(0);
  });

  it("closestOnSegment: 射影が線分内・端点クランプ・退化線分", () => {
    const a = { x: 0, y: 0 },
      b = { x: 10, y: 0 };
    // 線分内への射影
    const mid = closestOnSegment({ x: 5, y: 3 }, a, b);
    expect(mid.pt).toEqual({ x: 5, y: 0 });
    expect(mid.d).toBeCloseTo(3);
    // 端点へのクランプ
    const clamped = closestOnSegment({ x: -4, y: 3 }, a, b);
    expect(clamped.pt).toEqual({ x: 0, y: 0 });
    expect(clamped.d).toBeCloseTo(5);
    // 退化線分（a ≈ b）
    const deg = closestOnSegment({ x: 3, y: 4 }, a, { x: 0, y: 0 });
    expect(deg.d).toBeCloseTo(5);
  });

  it("hitSegmentDistance: ポリライン全体の最近線分と index", () => {
    // L字: (0,0)-(10,0)-(10,10)
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    const r1 = hitSegmentDistance({ x: 5, y: 2 }, pts);
    expect(r1.index).toBe(0);
    expect(r1.d).toBeCloseTo(2);
    const r2 = hitSegmentDistance({ x: 13, y: 8 }, pts);
    expect(r2.index).toBe(1);
    expect(r2.d).toBeCloseTo(3);
    expect(r2.pt).toEqual({ x: 10, y: 8 });
    // 空・1点
    expect(hitSegmentDistance({ x: 0, y: 0 }, []).d).toBe(Infinity);
    expect(hitSegmentDistance({ x: 3, y: 4 }, [{ x: 0, y: 0 }]).d).toBeCloseTo(5);
  });

  it("scaleToRatio: 既知の縮尺と s<=0", () => {
    // s = 96 / (0.0254 * 1000) → 1:1,000
    const s1000 = 96 / (0.0254 * 1000);
    expect(scaleToRatio(s1000).replace(/[^0-9:]/g, "")).toBe("1:1000");
    expect(scaleToRatio(0)).toBe("1:∞");
    expect(scaleToRatio(-1)).toBe("1:∞");
  });
});

describe("snap", () => {
  it("gridInterval: 70px 基準 NICE 間隔の境界値", () => {
    // worldPerPixel = 70 / vtS
    expect(gridInterval(70)).toBe(1); // ちょうど 1 m/px → 1
    expect(gridInterval(69)).toBe(2); // 1.014… → 次の NICE 値 2
    expect(gridInterval(7)).toBe(10); // ちょうど 10 → 10
    expect(gridInterval(6.9)).toBeGreaterThan(10); // 10.14… → 25
    expect(gridInterval(1e-9)).toBe(500000); // 超ズームアウトは最大値で頭打ち
  });

  it("snapToGrid の代表値", () => {
    expect(snapToGrid({ x: 12, y: -12 }, 10)).toEqual({ x: 10, y: -10 });
    expect(snapToGrid({ x: 15, y: 25 }, 10)).toEqual({ x: 20, y: 30 }); // 中点は round で上へ
  });

  it("snapAngle: 45°刻みへのスナップと距離保存", () => {
    const from = { x: 0, y: 0 };
    const to = { x: 10, y: 1 }; // 5.7° → 0° へ
    const s = snapAngle(from, to, 45);
    const d = distance(from, to);
    expect(s.y).toBeCloseTo(0);
    expect(s.x).toBeCloseTo(d);
    // 距離 < 1 はスナップせずそのまま返す
    const near = { x: 0.5, y: 0.3 };
    expect(snapAngle(from, near, 45)).toBe(near);
  });
});

describe("catmullRom / maybeSmooth", () => {
  const tri: Point[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  ];

  it("開スプライン: 両端点が保存される", () => {
    const out = catmullRom(tri, 16, false);
    expect(out[0]).toEqual(tri[0]);
    expect(out[out.length - 1]).toEqual(tri[tri.length - 1]);
    expect(out.length).toBe(2 * 16 + 1);
  });

  it("閉スプライン: 始点で閉じる", () => {
    const out = catmullRom(tri, 16, true);
    expect(out[0]).toEqual(tri[0]);
    expect(out[out.length - 1]).toEqual(tri[0]);
    expect(out.length).toBe(3 * 16 + 1);
  });

  it("3点未満はコピーを返す", () => {
    const two: Point[] = [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
    ];
    const out = catmullRom(two);
    expect(out).toEqual(two);
    expect(out[0]).not.toBe(two[0]); // 複製であること
  });

  it("maybeSmooth: straight / rect / text は密化しない、curve の area は閉じる", () => {
    expect(maybeSmooth(tri, "line", "straight")).toBe(tri);
    expect(maybeSmooth(tri, "rect", "curve")).toBe(tri);
    expect(maybeSmooth(tri, "text", "curve")).toBe(tri);
    const line = maybeSmooth(tri, "line", "curve");
    expect(line.length).toBeGreaterThan(tri.length);
    const area = maybeSmooth(tri, "area", "curve");
    expect(area[area.length - 1]).toEqual(tri[0]); // 閉スプライン
  });
});

describe("dashSegments", () => {
  it("直線: 破線数・各長さ・on 比率が正しい", () => {
    // 長さ12の水平線を [2,2] で → 3本、各長さ2、合計 on = 12 * 2/(2+2) = 6
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 12, y: 0 },
    ];
    const segs = dashSegments(pts, [2, 2]);
    expect(segs.length).toBe(3);
    for (const s of segs) expect(pathLength(s)).toBeCloseTo(2);
    const totalOn = segs.reduce((acc, s) => acc + pathLength(s), 0);
    expect(totalOn).toBeCloseTo((12 * 2) / (2 + 2));
  });

  it("頂点をまたぐ破線でも合計長が保存される", () => {
    // L字（長さ12）を [3,1] で → on 区間 [0,3],[4,7],[8,11] 合計9。[4,7] は角(6)をまたぐ
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 6 },
    ];
    const segs = dashSegments(pts, [3, 1]);
    const totalOn = segs.reduce((acc, s) => acc + pathLength(s), 0);
    expect(totalOn).toBeCloseTo(9);
    // 角をまたいだ破線は中間頂点 (6,0) を含む
    const crossing = segs.find((s) => s.length > 2);
    expect(crossing).toBeDefined();
    expect(crossing).toContainEqual({ x: 6, y: 0 });
  });

  it("不正入力（on<=0・点1個）は空配列", () => {
    expect(dashSegments([{ x: 0, y: 0 }], [2, 2])).toEqual([]);
    expect(
      dashSegments(
        [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
        ],
        [0, 2]
      )
    ).toEqual([]);
  });
});

describe("sleepers", () => {
  it("本数 = floor(長さ/spacing)±1、各枕木の長さ・法線方向が正しい", () => {
    // 長さ100の水平線、spacing=10、len=6
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const out = sleepers(pts, 10, 6);
    expect(Math.abs(out.length - Math.floor(100 / 10))).toBeLessThanOrEqual(1);
    for (const [a, b] of out) {
      expect(distance(a, b)).toBeCloseTo(6);
      // 水平線の法線 = 垂直: x が一致し y が ±3
      expect(a.x).toBeCloseTo(b.x);
      expect(Math.abs(b.y - a.y)).toBeCloseTo(6);
    }
  });

  it("斜め線でも接線と直交する", () => {
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 30, y: 40 }, // 長さ50、接線 (0.6, 0.8)
    ];
    const out = sleepers(pts, 10, 4);
    expect(out.length).toBeGreaterThan(0);
    for (const [a, b] of out) {
      const dot = (b.x - a.x) * 0.6 + (b.y - a.y) * 0.8;
      expect(dot).toBeCloseTo(0, 6);
      expect(distance(a, b)).toBeCloseTo(4);
    }
  });

  it("不正入力（spacing<=0・点1個）は空配列", () => {
    expect(sleepers([{ x: 0, y: 0 }], 10, 4)).toEqual([]);
    expect(
      sleepers(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        0,
        4
      )
    ).toEqual([]);
  });
});

describe("polygon", () => {
  const square: Point[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it("pointInPolygon: 正方形の内外", () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
    expect(pointInPolygon({ x: -1, y: -1 }, square)).toBe(false);
  });

  it("pointInPolygon: 凹多角形", () => {
    // コの字（右側が凹み）
    const concave: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 3 },
      { x: 4, y: 3 },
      { x: 4, y: 7 },
      { x: 10, y: 7 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(pointInPolygon({ x: 2, y: 5 }, concave)).toBe(true); // 左の胴体
    expect(pointInPolygon({ x: 7, y: 5 }, concave)).toBe(false); // 凹み内
  });

  it("polygonCentroid: 正方形・三角形・退化", () => {
    expect(polygonCentroid(square)).toEqual({ x: 5, y: 5 });
    const tri: Point[] = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 0, y: 6 },
    ];
    const c = polygonCentroid(tri);
    expect(c.x).toBeCloseTo(2);
    expect(c.y).toBeCloseTo(2);
    // 退化（一直線）は頂点平均へフォールバック
    const flat: Point[] = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(polygonCentroid(flat)).toEqual({ x: 5, y: 0 });
    expect(polygonCentroid([])).toEqual({ x: 0, y: 0 });
  });

  it("bbox: 代表形状と空配列", () => {
    expect(bbox(square)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
    expect(bbox([{ x: -3, y: 7 }])).toEqual({ minX: -3, minY: 7, maxX: -3, maxY: 7 });
    expect(bbox([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });
});
