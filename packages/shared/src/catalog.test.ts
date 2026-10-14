import { describe, expect, it } from "vitest";
import { CATALOG, CATALOG_BY_ID, CATEGORIES, getCatalogByCategory } from "./catalog.js";
import { SYMBOL_PATHS } from "./symbolPaths.js";
import { DEFAULT_LAYERS, defaultLayerFor } from "./types.js";

// 実装書 §2.2 のデフォルトレイヤー対応表に載っている 11 カテゴリ
const KNOWN_CATS = [
  "地形",
  "水系",
  "植生",
  "建物",
  "施設（点）",
  "施設（面）",
  "地図記号",
  "道路",
  "鉄道",
  "行政境界",
  "行政区分",
];

// パターン充填対象（実装書 §3.4 / §M1-2）
const PATTERN_ITEMS: Record<string, string> = {
  forest: "pat-forest",
  bamboo: "pat-bamboo",
  orchard: "pat-orchard",
  rice: "pat-rice",
  farmland: "pat-farmland",
  grassland: "pat-grassland",
  wetland: "pat-wetland",
  sand: "pat-sand",
};

describe("catalog", () => {
  it("件数 = 116", () => {
    expect(CATALOG.length).toBe(116);
  });

  it("ID に重複がない", () => {
    const ids = CATALOG.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("全ての sym が SYMBOL_PATHS に存在する（42種）", () => {
    const syms = CATALOG.filter((c) => c.style.sym != null).map((c) => c.style.sym!);
    expect(new Set(syms).size).toBe(42);
    for (const sym of syms) {
      expect(SYMBOL_PATHS[sym], `sym "${sym}" が SYMBOL_PATHS に無い`).toBeDefined();
    }
  });

  it("全ての cat が §2.2 対応表（11分類）に載っている", () => {
    expect(CATEGORIES.length).toBe(11);
    for (const cat of CATEGORIES) {
      expect(KNOWN_CATS, `cat "${cat}" が対応表に無い`).toContain(cat);
    }
  });

  it("defaultLayerFor が全項目で DEFAULT_LAYERS のいずれかを返す", () => {
    const layerIds = new Set(DEFAULT_LAYERS.map((l) => l.id));
    for (const item of CATALOG) {
      expect(layerIds.has(defaultLayerFor(item)), `${item.id} → ${defaultLayerFor(item)}`).toBe(
        true
      );
    }
  });

  it("パターン充填対象の 8 種だけが pattern キーを持ち、値のグリフが存在する", () => {
    const withPattern = CATALOG.filter((c) => c.style.pattern != null);
    expect(withPattern.map((c) => c.id).sort()).toEqual(Object.keys(PATTERN_ITEMS).sort());
    for (const item of withPattern) {
      expect(item.style.pattern).toBe(PATTERN_ITEMS[item.id]);
      expect(
        SYMBOL_PATHS[item.style.pattern!],
        `パターングリフ "${item.style.pattern}" が SYMBOL_PATHS に無い`
      ).toBeDefined();
    }
  });

  it("CATALOG_BY_ID / getCatalogByCategory の整合", () => {
    expect(Object.keys(CATALOG_BY_ID).length).toBe(116);
    expect(CATALOG_BY_ID["motorway"]?.name).toBe("高速道路");
    const roads = getCatalogByCategory("道路");
    expect(roads.length).toBe(9);
    expect(roads.every((c) => c.cat === "道路")).toBe(true);
    // 全カテゴリの合計 = 116
    const total = CATEGORIES.reduce((acc, cat) => acc + getCatalogByCategory(cat).length, 0);
    expect(total).toBe(116);
  });
});
