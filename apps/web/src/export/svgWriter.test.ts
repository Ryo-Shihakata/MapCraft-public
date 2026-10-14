import { describe, expect, it } from "vitest";
import { CATALOG_BY_ID, DEFAULT_LAYERS, type MapObject } from "@mapcraft/shared";
import { exportSvg } from "./svgWriter.js";

// vitest プロジェクト構成上 DOMParser 等の DOM API が無い環境（node）で走るため、
// 独自の軽量な整形式（well-formed）チェッカーでタグの対応・属性クォートを検証する。
// フル XML 仕様準拠のパーサではなく、本モジュールが生成する構造（属性は必ず二重引用符・
// 自己終了タグは常に " />"）を前提にした簡易版。
function assertWellFormedXml(xml: string): void {
  expect(xml.startsWith("<svg")).toBe(true);
  expect(xml.trimEnd().endsWith("</svg>")).toBe(true);

  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:\s+[^<>]*?)?)(\/?)>/g;
  const stack: string[] = [];
  let match: RegExpExecArray | null;
  let count = 0;
  while ((match = tagRe.exec(xml)) !== null) {
    count++;
    const [, closing, name, attrs, selfClose] = match;
    if (closing === "/") {
      const top = stack.pop();
      expect(top, `閉じタグ </${name}> に対応する開始タグが無い`).toBe(name);
      continue;
    }
    // 属性値はすべて二重引用符で括られていること（奇数個の " が無いこと = 閉じている）
    if (attrs) {
      const quoteCount = (attrs.match(/"/g) ?? []).length;
      expect(quoteCount % 2, `${name} の属性クォートが不揃い: ${attrs}`).toBe(0);
    }
    if (selfClose !== "/") stack.push(name!);
  }
  expect(count, "タグが1つも見つからない").toBeGreaterThan(0);
  expect(stack, `閉じられていないタグが残っている: ${stack.join(",")}`).toEqual([]);
}

function make(partial: Omit<MapObject, "id" | "createdAt">): MapObject {
  return { id: crypto.randomUUID(), createdAt: 0, ...partial };
}

const WORLD_BBOX = { minX: -100, minY: -100, maxX: 100, maxY: 100 };

describe("exportSvg", () => {
  it("空オブジェクトでも well-formed な SVG（背景のみ）を返す", () => {
    const svg = exportSvg([], DEFAULT_LAYERS, CATALOG_BY_ID, { bbox: WORLD_BBOX, pxPerMeter: 1, scale: 0.1 });
    assertWellFormedXml(svg);
    expect(svg).toContain('viewBox="-100 -100 200 200"');
    expect(svg).toContain("#f7f5f0");
  });

  it("casing 付き道路（line + casing + dash なし）", () => {
    const obj = make({
      geom: "line",
      itemId: "motorway",
      pts: [
        { x: -50, y: 0 },
        { x: 50, y: 20 },
      ],
      layerId: "transport",
    });
    const svg = exportSvg([obj], DEFAULT_LAYERS, CATALOG_BY_ID, { bbox: WORLD_BBOX, pxPerMeter: 1, scale: 0.1 });
    assertWellFormedXml(svg);
    expect(svg).toContain('stroke="#aa5500"'); // casing 色
    expect(svg).toContain('stroke="#ff8800"'); // 本線色
    expect(svg).not.toContain("stroke-dasharray");
    expect(svg).toMatchSnapshot();
  });

  it("破線道路（track: dash指定あり）は stroke-dasharray を native 出力する", () => {
    const obj = make({
      geom: "line",
      itemId: "track",
      pts: [
        { x: -30, y: 0 },
        { x: 30, y: 0 },
      ],
      layerId: "transport",
    });
    const svg = exportSvg([obj], DEFAULT_LAYERS, CATALOG_BY_ID, { bbox: WORLD_BBOX, pxPerMeter: 1, scale: 0.1 });
    assertWellFormedXml(svg);
    expect(svg).toContain('stroke-dasharray="8 4"');
  });

  it("鉄道（rail: 枕木線分）は sleepers の本数だけ <line> を出力する", () => {
    const obj = make({
      geom: "line",
      itemId: "jrline",
      pts: [
        { x: -60, y: 0 },
        { x: 60, y: 0 },
      ],
      layerId: "transport",
    });
    const svg = exportSvg([obj], DEFAULT_LAYERS, CATALOG_BY_ID, { bbox: WORLD_BBOX, pxPerMeter: 1, scale: 0.1 });
    assertWellFormedXml(svg);
    const lineCount = (svg.match(/<line /g) ?? []).length;
    expect(lineCount).toBeGreaterThan(0);
  });

  it("パターン充填エリア（forest）は <pattern> defs + url(#...) fill を出力する", () => {
    const obj = make({
      geom: "area",
      itemId: "forest",
      pts: [
        { x: -40, y: -40 },
        { x: 40, y: -40 },
        { x: 40, y: 40 },
        { x: -40, y: 40 },
      ],
      layerId: "vegetation",
    });
    const svg = exportSvg([obj], DEFAULT_LAYERS, CATALOG_BY_ID, { bbox: WORLD_BBOX, pxPerMeter: 1, scale: 0.1 });
    assertWellFormedXml(svg);
    expect(svg).toContain("<pattern ");
    expect(svg).toMatch(/fill="url\(#pat-forest-fill-[^"]+\)"/);
    expect(svg).toMatchSnapshot();
  });

  it("点記号（point + showLabel）は <use> と白縁ラベルを出力する", () => {
    const obj = make({
      geom: "point",
      itemId: "station",
      pt: { x: 0, y: 0 },
      name: "架空駅",
      showLabel: true,
      layerId: "buildings",
    });
    const svg = exportSvg([obj], DEFAULT_LAYERS, CATALOG_BY_ID, { bbox: WORLD_BBOX, pxPerMeter: 1, scale: 0.1 });
    assertWellFormedXml(svg);
    expect(svg).toContain('<use href="#sym-station"');
    expect(svg).toContain("架空駅");
    expect(svg).toContain('paint-order="stroke"');
    expect(svg).toMatchSnapshot();
  });

  it("縦書きテキスト（text + orientation v）は文字ごとに <text> を出力する", () => {
    const obj = make({
      geom: "text",
      itemId: "text",
      pt: { x: 0, y: 0 },
      text: "山\n川",
      fontSize: 50,
      orientation: "v",
      layerId: "annotation",
    });
    const svg = exportSvg([obj], DEFAULT_LAYERS, CATALOG_BY_ID, { bbox: WORLD_BBOX, pxPerMeter: 1, scale: 0.1 });
    assertWellFormedXml(svg);
    expect(svg).toContain(">山<");
    expect(svg).toContain(">川<");
  });

  it("非表示オブジェクト（visible:false）とレイヤー非表示は出力しない", () => {
    const hiddenObj = make({
      geom: "point",
      itemId: "station",
      pt: { x: 0, y: 0 },
      visible: false,
      layerId: "buildings",
    });
    const layerHiddenObj = make({
      geom: "point",
      itemId: "triangle",
      pt: { x: 10, y: 10 },
      layerId: "buildings",
    });
    const layers = DEFAULT_LAYERS.map((l) => (l.id === "buildings" ? { ...l, visible: false } : l));
    const svg1 = exportSvg([hiddenObj], DEFAULT_LAYERS, CATALOG_BY_ID, { bbox: WORLD_BBOX, pxPerMeter: 1, scale: 0.1 });
    expect(svg1).not.toContain("sym-station");

    const svg2 = exportSvg([layerHiddenObj], layers, CATALOG_BY_ID, { bbox: WORLD_BBOX, pxPerMeter: 1, scale: 0.1 });
    expect(svg2).not.toContain("sym-triangle");
  });

  it("minS/maxS: 現在の縮尺（scale）がレイヤー範囲外なら出力しない", () => {
    const obj = make({ geom: "point", itemId: "station", pt: { x: 0, y: 0 }, layerId: "buildings" });
    const layers = DEFAULT_LAYERS.map((l) => (l.id === "buildings" ? { ...l, minS: 1, maxS: 10 } : l));
    const svg = exportSvg([obj], layers, CATALOG_BY_ID, { bbox: WORLD_BBOX, pxPerMeter: 1, scale: 0.1 });
    expect(svg).not.toContain("sym-station");
  });

  it("z 昇順で出力される", () => {
    const low = make({ geom: "rect", itemId: "building", pts: [{ x: -10, y: -10 }, { x: 10, y: 10 }], layerId: "buildings" }); // z=16
    const high = make({ geom: "point", itemId: "station", pt: { x: 0, y: 0 }, layerId: "buildings" }); // z=84
    const svg = exportSvg([high, low], DEFAULT_LAYERS, CATALOG_BY_ID, { bbox: WORLD_BBOX, pxPerMeter: 1, scale: 0.1 });
    const rectIdx = svg.indexOf("<rect x=");
    const useIdx = svg.indexOf("<use href");
    expect(rectIdx).toBeGreaterThan(-1);
    expect(useIdx).toBeGreaterThan(-1);
    expect(rectIdx).toBeLessThan(useIdx);
  });

  it("rect（矩形建物）", () => {
    const obj = make({
      geom: "rect",
      itemId: "building",
      pts: [
        { x: -10, y: -5 },
        { x: 10, y: 5 },
      ],
      layerId: "buildings",
    });
    const svg = exportSvg([obj], DEFAULT_LAYERS, CATALOG_BY_ID, { bbox: WORLD_BBOX, pxPerMeter: 1, scale: 0.1 });
    assertWellFormedXml(svg);
    expect(svg).toMatchSnapshot();
  });
});
