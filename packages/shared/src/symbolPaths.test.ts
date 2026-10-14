import { describe, expect, it } from "vitest";
import { CATALOG } from "./catalog.js";
import { SYMBOL_PATHS } from "./symbolPaths.js";

const PATTERN_GLYPHS = [
  "pat-forest",
  "pat-bamboo",
  "pat-orchard",
  "pat-rice",
  "pat-farmland",
  "pat-grassland",
  "pat-wetland",
  "pat-sand",
];

describe("SYMBOL_PATHS", () => {
  it("エントリ数 = 50（sym 42種 + パターングリフ 8種）で過不足がない", () => {
    const keys = Object.keys(SYMBOL_PATHS);
    expect(keys.length).toBe(50);
    const catalogSyms = new Set(
      CATALOG.filter((c) => c.style.sym != null).map((c) => c.style.sym!)
    );
    const expected = new Set([...catalogSyms, ...PATTERN_GLYPHS]);
    expect(new Set(keys)).toEqual(expected);
  });

  it("全エントリの d が絶対座標コマンドで始まる非空文字列", () => {
    for (const [key, def] of Object.entries(SYMBOL_PATHS)) {
      expect(def.d.length, `${key} の d が空`).toBeGreaterThan(0);
      expect(def.d.startsWith("M"), `${key} の d が M で始まらない`).toBe(true);
      // 相対コマンド（小文字）を使っていないこと（座標範囲テストの前提）
      expect(/[a-z]/.test(def.d.replace(/\s/g, "")), `${key} に相対コマンドがある`).toBe(false);
    }
  });

  it("全エントリの d の座標数値が viewBox 0 0 24 24 の範囲内（-2〜26 許容）", () => {
    for (const [key, def] of Object.entries(SYMBOL_PATHS)) {
      const numbers = def.d.match(/-?\d+(?:\.\d+)?/g) ?? [];
      expect(numbers.length, `${key} に数値が無い`).toBeGreaterThan(0);
      for (const n of numbers) {
        const v = Number(n);
        expect(v, `${key} の座標 ${v} が範囲外`).toBeGreaterThanOrEqual(-2);
        expect(v, `${key} の座標 ${v} が範囲外`).toBeLessThanOrEqual(26);
      }
    }
  });

  it("strokeOnly は boolean（指定時のみ true）", () => {
    for (const def of Object.values(SYMBOL_PATHS)) {
      if (def.strokeOnly !== undefined) expect(def.strokeOnly).toBe(true);
    }
    // 代表: 温泉は線画、駅は塗り
    expect(SYMBOL_PATHS["hotspring"]?.strokeOnly).toBe(true);
    expect(SYMBOL_PATHS["station"]?.strokeOnly).toBeUndefined();
  });
});
