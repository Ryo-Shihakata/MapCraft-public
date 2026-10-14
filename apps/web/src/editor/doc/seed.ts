// 開発用シード（実装書 §M3-1・§M3-6）。
// seedLocalDefaults: 空ドキュメントに DEFAULT_LAYERS を投入する（EditorPage が常時呼ぶ）。
// seedDemoObjects: `?seed=demo` のときだけ代表オブジェクト約20個を投入する（手動検証用）。
import { DEFAULT_LAYERS } from "@mapcraft/shared";
import type { MapObject } from "@mapcraft/shared";
import type { MapDoc } from "./MapDoc.js";

export function seedLocalDefaults(mapDoc: MapDoc): void {
  if (mapDoc.getLayers().length > 0) return; // 冪等（StrictMode 二重実行対策）
  for (const layer of DEFAULT_LAYERS) mapDoc.upsertLayer(layer);
}

function make(partial: Omit<MapObject, "id" | "createdAt">): MapObject {
  return { id: crypto.randomUUID(), createdAt: Date.now(), ...partial };
}

// 全 geom・道路casing・鉄道枕木・破線・パターンエリア(8種のうち2種以上)・
// 点記号数種・admin を含む代表オブジェクト群（§M3 DoD の目視確認用）。
export function seedDemoObjects(mapDoc: MapDoc): void {
  if (mapDoc.getAllObjects().length > 0) return; // 冪等（StrictMode 二重実行対策）

  const objects: MapObject[] = [
    // ── line: casing 付き道路 ──────────────────────────────────────────
    make({
      geom: "line",
      itemId: "motorway",
      pts: [
        { x: -600, y: -250 },
        { x: -200, y: -300 },
        { x: 200, y: -200 },
        { x: 600, y: -150 },
      ],
      layerId: "transport",
    }),
    // ── line: 鉄道（枕木） ──────────────────────────────────────────────
    make({
      geom: "line",
      itemId: "jrline",
      pts: [
        { x: -580, y: 150 },
        { x: -100, y: 120 },
        { x: 300, y: 180 },
        { x: 580, y: 120 },
      ],
      layerId: "transport",
    }),
    // ── line: 破線（徒歩道）＋曲線モード ────────────────────────────────
    make({
      geom: "line",
      itemId: "footway",
      pts: [
        { x: -250, y: 300 },
        { x: 0, y: 350 },
        { x: 250, y: 300 },
      ],
      mode: "curve",
      layerId: "transport",
    }),
    // ── line: 河川（曲線） ──────────────────────────────────────────────
    make({
      geom: "line",
      itemId: "river-l",
      pts: [
        { x: -620, y: -380 },
        { x: -400, y: -100 },
        { x: -100, y: 50 },
        { x: 200, y: 300 },
        { x: 550, y: 380 },
      ],
      mode: "curve",
      layerId: "water",
    }),
    // ── line: 等高線（8桁hexアルファのテスト） ──────────────────────────
    make({
      geom: "line",
      itemId: "contour",
      pts: [
        { x: -500, y: -350 },
        { x: -300, y: -380 },
        { x: -50, y: -340 },
        { x: 200, y: -370 },
        { x: 450, y: -330 },
      ],
      mode: "curve",
      layerId: "terrain",
    }),
    // ── line: 行政境界（破線） ──────────────────────────────────────────
    make({
      geom: "line",
      itemId: "bord-pref",
      pts: [
        { x: -650, y: -50 },
        { x: -650, y: 400 },
      ],
      layerId: "admin",
    }),
    // ── line: 用水路（破線） ────────────────────────────────────────────
    make({
      geom: "line",
      itemId: "canal",
      pts: [
        { x: -100, y: -50 },
        { x: 100, y: -30 },
        { x: 300, y: -60 },
      ],
      layerId: "water",
    }),

    // ── area: パターン充填3種 ───────────────────────────────────────────
    make({
      geom: "area",
      itemId: "forest",
      pts: [
        { x: -600, y: -350 },
        { x: -350, y: -350 },
        { x: -350, y: -150 },
        { x: -600, y: -150 },
      ],
      layerId: "vegetation",
    }),
    make({
      geom: "area",
      itemId: "wetland",
      pts: [
        { x: -150, y: 150 },
        { x: 100, y: 120 },
        { x: 150, y: 300 },
        { x: -100, y: 320 },
      ],
      layerId: "terrain",
    }),
    make({
      geom: "area",
      itemId: "farmland",
      pts: [
        { x: 200, y: -150 },
        { x: 450, y: -180 },
        { x: 480, y: 50 },
        { x: 220, y: 80 },
      ],
      layerId: "vegetation",
    }),
    // ── area: パターン無し（海） ─────────────────────────────────────────
    make({
      geom: "area",
      itemId: "ocean",
      pts: [
        { x: 250, y: 150 },
        { x: 600, y: 120 },
        { x: 650, y: 380 },
        { x: 300, y: 400 },
        { x: 150, y: 300 },
      ],
      layerId: "water",
    }),

    // ── rect: 建物2種 ───────────────────────────────────────────────────
    make({
      geom: "rect",
      itemId: "building",
      pts: [
        { x: -50, y: -50 },
        { x: 50, y: 20 },
      ],
      layerId: "buildings",
    }),
    make({
      geom: "rect",
      itemId: "imp-bld",
      pts: [
        { x: -150, y: -30 },
        { x: -60, y: 40 },
      ],
      layerId: "buildings",
    }),

    // ── admin: 中央ラベル付き行政区分 ───────────────────────────────────
    make({
      geom: "admin",
      itemId: "adm-city",
      pts: [
        { x: -650, y: -400 },
        { x: 650, y: -400 },
        { x: 650, y: 400 },
        { x: -650, y: 400 },
      ],
      name: "架空市",
      showLabel: true,
      layerId: "admin",
    }),

    // ── point: 記号数種（スクリーン固定サイズ） ─────────────────────────
    make({ geom: "point", itemId: "station", pt: { x: 0, y: 0 }, layerId: "buildings" }),
    make({ geom: "point", itemId: "triangle", pt: { x: -450, y: -250 }, layerId: "buildings" }),
    make({ geom: "point", itemId: "hotspring", pt: { x: 380, y: 250 }, layerId: "buildings" }),
    make({ geom: "point", itemId: "cityhall", pt: { x: -30, y: -100 }, layerId: "buildings" }),
    make({ geom: "point", itemId: "shrine-sym", pt: { x: 150, y: -250 }, layerId: "buildings" }),
    make({ geom: "point", itemId: "peak", pt: { x: -500, y: 300 }, layerId: "buildings" }),
    make({ geom: "point", itemId: "lighthouse", pt: { x: 550, y: 300 }, layerId: "buildings" }),

    // ── text: 注記 ──────────────────────────────────────────────────────
    make({
      geom: "text",
      itemId: "text",
      pt: { x: -400, y: -420 },
      text: "架空地方",
      fontSize: 60,
      orientation: "h",
      layerId: "annotation",
    }),
  ];

  mapDoc.transact(() => {
    for (const obj of objects) mapDoc.upsertObject(obj);
  });
}

// M10-2 性能検証用シード（`?seed=perf`）。5,000 オブジェクト（線2,000/エリア1,500/
// 記号1,000/テキスト500）を 50km 四方（world座標 ±25,000m）に分布させる。
// mulberry32 の決定論的 PRNG を使い、実行のたびに同じ配置になるようにする（計測の再現性）。
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PERF_HALF_EXTENT = 25_000; // 50km四方 → 中心から ±25,000m
const PERF_LINE_ITEMS = ["footway", "national", "river-m", "canal", "bord-pref"];
const PERF_AREA_ITEMS = ["forest", "farmland", "grassland", "wetland", "ocean"];
const PERF_POINT_ITEMS = ["station", "triangle", "hotspring", "cityhall", "peak", "lighthouse", "shrine-sym"];

export function seedPerfObjects(mapDoc: MapDoc): void {
  if (mapDoc.getAllObjects().length > 0) return; // 冪等（StrictMode 二重実行対策）

  const rand = mulberry32(20260717);
  const objects: MapObject[] = [];
  const randCoord = () => rand() * PERF_HALF_EXTENT * 2 - PERF_HALF_EXTENT;
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)] as T;

  for (let i = 0; i < 2000; i++) {
    const ox = randCoord();
    const oy = randCoord();
    const segCount = 2 + Math.floor(rand() * 3); // 2〜4頂点
    const pts = Array.from({ length: segCount }, () => ({
      x: ox + (rand() - 0.5) * 800,
      y: oy + (rand() - 0.5) * 800,
    }));
    objects.push(make({ geom: "line", itemId: pick(PERF_LINE_ITEMS), pts, layerId: "transport" }));
  }

  for (let i = 0; i < 1500; i++) {
    const ox = randCoord();
    const oy = randCoord();
    const r = 100 + rand() * 300;
    const vertexCount = 4 + Math.floor(rand() * 3); // 4〜6頂点の簡易多角形
    const pts = Array.from({ length: vertexCount }, (_, idx) => {
      const angle = (idx / vertexCount) * Math.PI * 2;
      return { x: ox + Math.cos(angle) * r, y: oy + Math.sin(angle) * r };
    });
    objects.push(make({ geom: "area", itemId: pick(PERF_AREA_ITEMS), pts, layerId: "vegetation" }));
  }

  for (let i = 0; i < 1000; i++) {
    objects.push(
      make({ geom: "point", itemId: pick(PERF_POINT_ITEMS), pt: { x: randCoord(), y: randCoord() }, layerId: "buildings" })
    );
  }

  for (let i = 0; i < 500; i++) {
    objects.push(
      make({
        geom: "text",
        itemId: "text",
        pt: { x: randCoord(), y: randCoord() },
        text: `注記${i}`,
        fontSize: 80,
        orientation: "h",
        layerId: "annotation",
      })
    );
  }

  mapDoc.transact(() => {
    for (const obj of objects) mapDoc.upsertObject(obj);
  });
}
