import { describe, expect, it } from "vitest";
import { parseFmap, serializeFmap } from "./fmap.js";
import type { Layer, MapObject } from "./types.js";
import { DEFAULT_LAYERS } from "./types.js";

const layers: Layer[] = DEFAULT_LAYERS;
const layerOrder = layers.map((l) => l.id);

const objects: MapObject[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    geom: "line",
    itemId: "national",
    pts: [
      { x: 0, y: 0 },
      { x: 100, y: 50 },
    ],
    mode: "straight",
    layerId: "transport",
    createdAt: 1_700_000_000_000,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    geom: "point",
    itemId: "station",
    pt: { x: 50, y: 25 },
    name: "中央駅",
    showLabel: true,
    styleOverride: { size: 18, color: "#003366" },
    layerId: "buildings",
    createdAt: 1_700_000_000_001,
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    geom: "text",
    itemId: "text",
    pt: { x: -200, y: 300 },
    text: "架空湾\n（テスト）",
    fontSize: 120,
    orientation: "v",
    layerId: "annotation",
    createdAt: 1_700_000_000_002,
  },
];

describe("fmap", () => {
  it("正常系 roundtrip: serialize → parse で内容が一致する", () => {
    const json = serializeFmap({ name: "テスト地図", layers, layerOrder, objects });
    const file = parseFmap(json);
    expect(file.format).toBe("fmap");
    expect(file.version).toBe(2);
    expect(file.name).toBe("テスト地図");
    expect(file.layers).toEqual(layers);
    expect(file.layerOrder).toEqual(layerOrder);
    expect(file.objects).toEqual(objects);
    // exportedAt は ISO8601
    expect(new Date(file.exportedAt).toISOString()).toBe(file.exportedAt);
  });

  it("JSON.parse 済みの値も受け付ける", () => {
    const json = serializeFmap({ name: "x", layers, layerOrder, objects: [] });
    const file = parseFmap(JSON.parse(json));
    expect(file.name).toBe("x");
    expect(file.objects).toEqual([]);
  });

  it("壊れた JSON 文字列は reject（SyntaxError）", () => {
    expect(() => parseFmap("{ not json")).toThrow();
  });

  it("format / version の不一致は reject", () => {
    const base = JSON.parse(serializeFmap({ name: "x", layers, layerOrder, objects: [] }));
    expect(() => parseFmap({ ...base, format: "gmap" })).toThrow();
    expect(() => parseFmap({ ...base, version: 1 })).toThrow();
  });

  it("必須フィールド欠落・型不正のオブジェクトは reject", () => {
    const base = JSON.parse(serializeFmap({ name: "x", layers, layerOrder, objects }));
    const clone = (v: unknown) => JSON.parse(JSON.stringify(v));
    // layerId 欠落
    const missing = clone(base);
    delete missing.objects[0].layerId;
    expect(() => parseFmap(missing)).toThrow();
    // geom が不正値
    const badGeom = clone(base);
    badGeom.objects[0].geom = "circle";
    expect(() => parseFmap(badGeom)).toThrow();
    // objects が配列でない
    expect(() => parseFmap({ ...base, objects: {} })).toThrow();
  });

  it("未知キーは除去される（zod strip）", () => {
    const base = JSON.parse(serializeFmap({ name: "x", layers, layerOrder, objects: [] }));
    const file = parseFmap({ ...base, evil: "payload" });
    expect("evil" in file).toBe(false);
  });
});
