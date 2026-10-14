// hitTest / hitTestRect の検証（実装書 §3.8 DoD: geom別代表ケース・z優先・tol境界・
// ロック/非表示除外）。CATALOG の実データ（national/forest/station/building/adm-city）を使う。
import { describe, expect, it } from "vitest";
import type { Layer, MapObject, ViewTransform } from "@mapcraft/shared";
import { DEFAULT_LAYERS } from "@mapcraft/shared";
import { hitTest, hitTestRect } from "./hitTest.js";

const vt: ViewTransform = { x: 0, y: 0, s: 1 }; // world 1unit = screen 1px → tol = 6

function layers(overrides: Partial<Record<string, Partial<Layer>>> = {}): Layer[] {
  return DEFAULT_LAYERS.map((l) => ({ ...l, ...(overrides[l.id] ?? {}) }));
}

const road: MapObject = {
  id: "road1",
  geom: "line",
  itemId: "national", // stroke line, w:10, z:40
  pts: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ],
  layerId: "transport",
  createdAt: 0,
};

const forest: MapObject = {
  id: "forest1",
  geom: "area",
  itemId: "forest", // sw:1, z:4
  pts: [
    { x: 200, y: 200 },
    { x: 300, y: 200 },
    { x: 300, y: 300 },
    { x: 200, y: 300 },
  ],
  layerId: "vegetation",
  createdAt: 0,
};

const adminArea: MapObject = {
  id: "admin1",
  geom: "admin",
  itemId: "adm-city", // sw:1, z:2
  pts: [
    { x: -50, y: -50 },
    { x: 50, y: -50 },
    { x: 50, y: 50 },
    { x: -50, y: 50 },
  ],
  layerId: "admin",
  createdAt: 0,
};

const rect: MapObject = {
  id: "rect1",
  geom: "rect",
  itemId: "building", // z:16
  pts: [
    { x: 500, y: 500 },
    { x: 540, y: 530 },
  ],
  layerId: "buildings",
  createdAt: 0,
};

const point: MapObject = {
  id: "pt1",
  geom: "point",
  itemId: "station", // size:14, z:84
  pt: { x: 1000, y: 1000 },
  layerId: "buildings",
  createdAt: 0,
};

const text: MapObject = {
  id: "text1",
  geom: "text",
  itemId: "text",
  pt: { x: 2000, y: 2000 },
  text: "地名",
  fontSize: 100,
  layerId: "annotation",
  createdAt: 0,
};

describe("hitTest — geom別代表ケース", () => {
  it("line: 線分近傍でヒットする（tol + w/2 以内）", () => {
    expect(hitTest({ x: 50, y: 0 }, vt, [road], layers())).toBe(road);
    expect(hitTest({ x: 50, y: 10 }, vt, [road], layers())).toBe(road); // w/2=5 + tol=6 = 11 以内
  });

  it("line: tol境界外は外れる", () => {
    expect(hitTest({ x: 50, y: 20 }, vt, [road], layers())).toBeNull(); // 11 < 20
  });

  it("area: ポリゴン内部でヒットする", () => {
    expect(hitTest({ x: 250, y: 250 }, vt, [forest], layers())).toBe(forest);
  });

  it("area: 枠線近傍（tol以内）でヒットする", () => {
    expect(hitTest({ x: 200 - 6, y: 250 }, vt, [forest], layers())).toBe(forest);
  });

  it("admin: ポリゴン内部でヒットする", () => {
    expect(hitTest({ x: 0, y: 0 }, vt, [adminArea], layers())).toBe(adminArea);
  });

  it("rect: bbox内部・枠線近傍でヒットする", () => {
    expect(hitTest({ x: 520, y: 515 }, vt, [rect], layers())).toBe(rect);
    expect(hitTest({ x: 500 - 5, y: 515 }, vt, [rect], layers())).toBe(rect);
    expect(hitTest({ x: 500 - 10, y: 515 }, vt, [rect], layers())).toBeNull();
  });

  it("point: (size/2+4)/vt.s 以内でヒットする", () => {
    // size=14 → radius = 14/2+4 = 11
    expect(hitTest({ x: 1000 + 10, y: 1000 }, vt, [point], layers())).toBe(point);
    expect(hitTest({ x: 1000 + 12, y: 1000 }, vt, [point], layers())).toBeNull();
  });

  it("text: 暫定bbox内でヒットする", () => {
    expect(hitTest({ x: 2000, y: 2000 }, vt, [text], layers())).toBe(text);
    expect(hitTest({ x: 2000 + 1000, y: 2000 }, vt, [text], layers())).toBeNull();
  });
});

describe("hitTest — z優先", () => {
  it("重なる2オブジェクトは z が高い方を返す", () => {
    // forest(z:4) と adminArea(z:2) を同じ場所に重ねる
    const highZ: MapObject = { ...forest, id: "highz", pts: [...adminArea.pts!] };
    const lowZ: MapObject = { ...adminArea, id: "lowz" };
    const result = hitTest({ x: 0, y: 0 }, vt, [lowZ, highZ], layers());
    expect(result?.id).toBe("highz");
  });
});

describe("hitTest — ロック/非表示除外", () => {
  it("object.locked のオブジェクトは除外される", () => {
    const locked: MapObject = { ...road, locked: true };
    expect(hitTest({ x: 50, y: 0 }, vt, [locked], layers())).toBeNull();
  });

  it("object.visible=false のオブジェクトは除外される", () => {
    const hidden: MapObject = { ...road, visible: false };
    expect(hitTest({ x: 50, y: 0 }, vt, [hidden], layers())).toBeNull();
  });

  it("所属レイヤーが visible=false なら除外される", () => {
    expect(hitTest({ x: 50, y: 0 }, vt, [road], layers({ transport: { visible: false } }))).toBeNull();
  });

  it("所属レイヤーが locked なら除外される", () => {
    expect(hitTest({ x: 50, y: 0 }, vt, [road], layers({ transport: { locked: true } }))).toBeNull();
  });

  it("vt.s が層の minS/maxS 範囲外なら除外される", () => {
    expect(hitTest({ x: 50, y: 0 }, vt, [road], layers({ transport: { minS: 2, maxS: 10 } }))).toBeNull();
  });
});

describe("hitTestRect — bbox交差", () => {
  it("矩形と交差するオブジェクトのみ返す", () => {
    const rectSel = { minX: -10, minY: -10, maxX: 60, maxY: 10 };
    const result = hitTestRect(rectSel, vt, [road, forest, point], layers());
    expect(result.map((o) => o.id)).toEqual(["road1"]);
  });

  it("ロック中・非表示は除外する", () => {
    const rectSel = { minX: -10, minY: -10, maxX: 60, maxY: 10 };
    const locked: MapObject = { ...road, locked: true };
    expect(hitTestRect(rectSel, vt, [locked], layers())).toHaveLength(0);
  });
});
