// resolveSnap の優先順位（頂点 > グリッド > 角度）を検証する（実装書 M4 DoD）。
import { describe, expect, it } from "vitest";
import type { MapObject, ViewTransform } from "@mapcraft/shared";
import { gridInterval, snapAngle } from "@mapcraft/shared";
import { resolveSnap, type SnapContext } from "./snap.js";

const vt: ViewTransform = { x: 0, y: 0, s: 1 }; // world 1unit = screen 1px
const ALL_ON = { vertex: true, grid: true, angle: true, angleDeg: 45 };

const lineObj: MapObject = {
  id: "l1",
  geom: "line",
  itemId: "footway",
  pts: [
    { x: 100, y: 0 },
    { x: 200, y: 0 },
  ],
  layerId: "transport",
  createdAt: 0,
};

function baseCtx(overrides: Partial<SnapContext> = {}): SnapContext {
  return { vt, objects: [lineObj], snapConfig: ALL_ON, prevPoint: null, ...overrides };
}

describe("resolveSnap 優先順位", () => {
  it("頂点が最優先: グリッド・角度の候補も同時に成立する位置でも頂点を返す", () => {
    // (100, 0) は lineObj の頂点そのもの。gridInterval(1) 上の点でもある。
    const interval = gridInterval(vt.s);
    expect(100 % interval).toBe(0);
    const prevPoint = { x: 100, y: 50 }; // 角度スナップも別の点を示す状況を作る
    const result = resolveSnap({ x: 101, y: 2 }, baseCtx({ prevPoint }));
    expect(result.kind).toBe("vertex");
    expect(result.pt).toEqual({ x: 100, y: 0 });
  });

  it("頂点が無効/圏外ならグリッドが角度より優先される", () => {
    const interval = gridInterval(vt.s);
    // 既存頂点から十分離れた位置。グリッド点にほぼ一致させる。
    const cursor = { x: 5 * interval + 1, y: 3 * interval - 1 };
    const prevPoint = { x: 0, y: 0 };
    const result = resolveSnap(cursor, baseCtx({ prevPoint }));
    expect(result.kind).toBe("grid");
    expect(result.pt).toEqual({ x: 5 * interval, y: 3 * interval });
  });

  it("頂点・グリッドとも不成立なら角度が適用される", () => {
    const interval = gridInterval(vt.s);
    // グリッドからも既存頂点からも十分離れた位置（半径14pxの外）。
    const cursor = { x: 5 * interval + interval / 2 + 30, y: 3 * interval + interval / 2 + 17 };
    const prevPoint = { x: 5 * interval, y: 3 * interval };
    const result = resolveSnap(cursor, baseCtx({ prevPoint }));
    expect(result.kind).toBe("angle");
    expect(result.pt).toEqual(snapAngle(prevPoint, cursor, 45));
  });

  it("全スナップ無効なら生のカーソル位置を返す（kind: null）", () => {
    const cursor = { x: 100.4, y: 0.2 }; // 頂点のすぐ近く
    const result = resolveSnap(
      cursor,
      baseCtx({ snapConfig: { vertex: false, grid: false, angle: false, angleDeg: 45 }, prevPoint: { x: 0, y: 0 } })
    );
    expect(result.kind).toBeNull();
    expect(result.pt).toEqual(cursor);
  });

  it("頂点以外の線分上最近点は segment として返る", () => {
    // (150, 3) は lineObj の中点付近の線分上。頂点(100,0)/(200,0)からは十分離れている。
    const cursor = { x: 150, y: 3 };
    const result = resolveSnap(cursor, baseCtx({ prevPoint: null }));
    expect(result.kind).toBe("segment");
    expect(result.pt).toEqual({ x: 150, y: 0 });
  });

  it("vertex設定が無効なら頂点上でもgrid/angleへフォールバックする", () => {
    const interval = gridInterval(vt.s);
    expect(100 % interval).toBe(0);
    const result = resolveSnap(
      { x: 100, y: 0 },
      baseCtx({ snapConfig: { ...ALL_ON, vertex: false } })
    );
    expect(result.kind).toBe("grid");
    expect(result.pt).toEqual({ x: 100, y: 0 });
  });
});
