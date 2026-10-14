import { describe, expect, it } from "vitest";
import { CATALOG_BY_ID } from "./catalog.js";
import type { CatalogItem, MapObject } from "./types.js";
import { DEFAULT_LAYERS, TEXT_BASE_STYLE, defaultLayerFor, effectiveStyle } from "./types.js";

function obj(partial: Partial<MapObject> & Pick<MapObject, "geom" | "itemId">): MapObject {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    layerId: "buildings",
    createdAt: 0,
    ...partial,
  };
}

describe("effectiveStyle", () => {
  it("catalog スタイルと styleOverride の shallow merge（override 優先）", () => {
    const o = obj({
      geom: "line",
      itemId: "national", // stroke #ffff00, casing #888800, w 10, z 40
      styleOverride: { w: 20, stroke: "#ff0000" },
    });
    const s = effectiveStyle(o, CATALOG_BY_ID);
    expect(s.stroke).toBe("#ff0000"); // 上書き
    expect(s.w).toBe(20); // 上書き
    expect(s.casing).toBe("#888800"); // カタログ値が残る
    expect(s.z).toBe(40);
  });

  it("override 無しはカタログ値そのまま、未知 itemId は override のみ", () => {
    const plain = effectiveStyle(obj({ geom: "point", itemId: "station" }), CATALOG_BY_ID);
    expect(plain).toEqual(CATALOG_BY_ID["station"]!.style);
    const unknown = effectiveStyle(
      obj({ geom: "line", itemId: "no-such-item", styleOverride: { w: 3 } }),
      CATALOG_BY_ID
    );
    expect(unknown).toEqual({ w: 3 });
  });

  it("text は TEXT_BASE_STYLE をベースにマージする", () => {
    const t = effectiveStyle(
      obj({ geom: "text", itemId: "text", styleOverride: { color: "#000000" } }),
      CATALOG_BY_ID
    );
    expect(t.color).toBe("#000000");
    expect(t.z).toBe(TEXT_BASE_STYLE.z);
  });
});

describe("defaultLayerFor / DEFAULT_LAYERS", () => {
  it("デフォルトレイヤーは 7 つで annotation を含む", () => {
    expect(DEFAULT_LAYERS.length).toBe(7);
    expect(DEFAULT_LAYERS.map((l) => l.id)).toContain("annotation");
  });

  it("§2.2 対応表の代表ケース", () => {
    const mk = (cat: string): CatalogItem => ({
      id: "x",
      name: "x",
      cat,
      geom: "line",
      style: {},
    });
    expect(defaultLayerFor(mk("地形"))).toBe("terrain");
    expect(defaultLayerFor(mk("水系"))).toBe("water");
    expect(defaultLayerFor(mk("植生"))).toBe("vegetation");
    expect(defaultLayerFor(mk("地図記号"))).toBe("buildings");
    expect(defaultLayerFor(mk("道路"))).toBe("transport");
    expect(defaultLayerFor(mk("鉄道"))).toBe("transport");
    expect(defaultLayerFor(mk("行政区分"))).toBe("admin");
    // 対応表に無いカテゴリは buildings へフォールバック
    expect(defaultLayerFor(mk("未知カテゴリ"))).toBe("buildings");
  });
});
