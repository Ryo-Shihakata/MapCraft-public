import type { CatalogItem } from "./types.js";

// ───────────────────────────────────────────────────────────────────────────────
// 組み込みカタログ — 国土地理院（GSI）2022 記号準拠。116 要素。
// v1 から ID・名前・スタイル値を変えずに移植（v2-implementation.md §M1-2）。
// v2 での変更点: パターン充填対象 8 種（forest / bamboo / orchard / rice /
// farmland / grassland / wetland / sand）に pattern キーを追加したのみ。
// Zオーダー: エリア1-5, 地形線6-14, 建物15-18, 水系19-25, 道路30-50,
//   鉄道51-65, 行政境界67-72, 点記号80+
// この ID 体系は M1 完了時点で凍結（変更は docs/v2-decisions.md 必須）。
// ───────────────────────────────────────────────────────────────────────────────

export const CATALOG: CatalogItem[] = [
  // ── 道路 (Roads) ────────────────────────────────────────────────────────────
  { id: "motorway",  name: "高速道路",       cat: "道路", geom: "line", style: { stroke: "#ff8800", casing: "#aa5500", w: 14, z: 50 } },
  { id: "national",  name: "国道",           cat: "道路", geom: "line", style: { stroke: "#ffff00", casing: "#888800", w: 10, z: 40 } },
  { id: "prefect",   name: "都道府県道",     cat: "道路", geom: "line", style: { stroke: "#ffffff", casing: "#888888", w:  8, z: 30 } },
  { id: "municipal", name: "市区町村道",     cat: "道路", geom: "line", style: { stroke: "#ffffff", casing: "#aaaaaa", w:  5, z: 20 } },
  { id: "track",     name: "軽車道",         cat: "道路", geom: "line", style: { stroke: "#dddddd", casing: "#aaaaaa", w:  3, z: 15, dash: [8, 4] } },
  { id: "footway",   name: "徒歩道",         cat: "道路", geom: "line", style: { stroke: "#cccccc", w: 2, z: 10, dash: [4, 4] } },
  { id: "bridge",    name: "橋",             cat: "道路", geom: "line", style: { stroke: "#ffffff", casing: "#555555", w:  8, z: 45 } },
  { id: "tunnel",    name: "トンネル",       cat: "道路", geom: "line", style: { stroke: "#bbbbbb", casing: "#777777", w:  5, z:  6, dash: [10, 4] } },
  { id: "steps",     name: "階段",           cat: "道路", geom: "line", style: { stroke: "#cccccc", w: 3, z: 12, dash: [3, 3] } },

  // ── 鉄道 (Railways) ─────────────────────────────────────────────────────────
  { id: "shinkansen", name: "新幹線",   cat: "鉄道", geom: "line", style: { stroke: "#222222", casing: "#cccccc", w: 6, z: 62, rail: true } },
  { id: "jrline",     name: "JR線",     cat: "鉄道", geom: "line", style: { stroke: "#333333", casing: "#cccccc", w: 4, z: 60, rail: true } },
  { id: "private",    name: "私鉄",     cat: "鉄道", geom: "line", style: { stroke: "#444444", casing: "#dddddd", w: 3, z: 58, rail: true } },
  { id: "monorail",   name: "モノレール", cat: "鉄道", geom: "line", style: { stroke: "#666666", casing: "#dddddd", w: 3, z: 56, rail: true } },
  { id: "tram",       name: "路面電車", cat: "鉄道", geom: "line", style: { stroke: "#555555", w: 2, z: 54, dash: [8, 3] } },
  { id: "cablecar",   name: "ケーブルカー", cat: "鉄道", geom: "line", style: { stroke: "#777777", w: 2, z: 52, dash: [6, 4] } },
  { id: "ropeway",    name: "ロープウェー", cat: "鉄道", geom: "line", style: { stroke: "#999999", w: 1, z: 51, dash: [2, 4] } },

  // ── 水系 (Water) ─────────────────────────────────────────────────────────────
  { id: "ocean",     name: "海・湖",   cat: "水系", geom: "area", style: { fill: "#aad4e8", sw: 1, stroke: "#6699bb", z: 3 } },
  { id: "pond",      name: "池・沼",   cat: "水系", geom: "area", style: { fill: "#aad4e8", sw: 1, stroke: "#6699bb", z: 3 } },
  { id: "river-l",   name: "大河川",   cat: "水系", geom: "line", style: { stroke: "#6699cc", w: 12, z: 24 } },
  { id: "river-m",   name: "中河川",   cat: "水系", geom: "line", style: { stroke: "#6699cc", w:  7, z: 23 } },
  { id: "river-s",   name: "小河川",   cat: "水系", geom: "line", style: { stroke: "#6699cc", w:  3, z: 22 } },
  { id: "canal",     name: "用水路",   cat: "水系", geom: "line", style: { stroke: "#6699cc", w:  2, z: 21, dash: [10, 3] } },
  { id: "ditch",     name: "水路",     cat: "水系", geom: "line", style: { stroke: "#88aacc", w:  1, z: 20, dash: [5, 3] } },
  { id: "coast",     name: "海岸線",   cat: "水系", geom: "line", style: { stroke: "#4477aa", w:  3, z: 25 } },
  { id: "waterfall", name: "滝",       cat: "水系", geom: "point", style: { sym: "waterfall",  color: "#4477aa", size: 12, z: 82 } },
  { id: "hotspring", name: "温泉",     cat: "水系", geom: "point", style: { sym: "hotspring",  color: "#cc4444", size: 12, z: 82 } },
  { id: "spring",    name: "泉",       cat: "水系", geom: "point", style: { sym: "spring",     color: "#4477aa", size: 12, z: 82 } },

  // ── 植生 (Vegetation) ────────────────────────────────────────────────────────
  { id: "forest",     name: "森林",   cat: "植生", geom: "area", style: { fill: "#c8e6c0", stroke: "#88aa80", sw: 1, z: 4, pattern: "pat-forest" } },
  { id: "bamboo",     name: "竹林",   cat: "植生", geom: "area", style: { fill: "#b8d8b0", stroke: "#88aa80", sw: 1, z: 4, pattern: "pat-bamboo" } },
  { id: "palm",       name: "ヤシ科", cat: "植生", geom: "area", style: { fill: "#c0e0a0", stroke: "#88aa80", sw: 1, z: 4 } },
  { id: "orchard",    name: "果樹園", cat: "植生", geom: "area", style: { fill: "#d0e8c0", stroke: "#88aa80", sw: 1, z: 4, pattern: "pat-orchard" } },
  { id: "grassland",  name: "草地",   cat: "植生", geom: "area", style: { fill: "#ddeebb", stroke: "#aabb88", sw: 1, z: 4, pattern: "pat-grassland" } },
  { id: "meadow",     name: "牧場",   cat: "植生", geom: "area", style: { fill: "#e0eec0", stroke: "#aabb88", sw: 1, z: 4 } },
  { id: "rice",       name: "水田",   cat: "植生", geom: "area", style: { fill: "#d0e8cc", stroke: "#88aa88", sw: 1, z: 4, pattern: "pat-rice" } },
  { id: "farmland",   name: "畑",     cat: "植生", geom: "area", style: { fill: "#e8e0c0", stroke: "#aaaa88", sw: 1, z: 4, pattern: "pat-farmland" } },
  { id: "greenhouse", name: "温室",   cat: "植生", geom: "area", style: { fill: "#e0f0f0", stroke: "#88aaaa", sw: 1, z: 4 } },
  { id: "scrub",      name: "荒地",   cat: "植生", geom: "area", style: { fill: "#d8d0b8", stroke: "#aaa888", sw: 1, z: 4 } },

  // ── 地形 (Terrain) ────────────────────────────────────────────────────────────
  { id: "contour",      name: "等高線",       cat: "地形", geom: "line",  style: { stroke: "#c8884488", w: 1, z: 8 } },
  { id: "contour5",     name: "計曲線",       cat: "地形", geom: "line",  style: { stroke: "#c88844",   w: 2, z: 9 } },
  { id: "cliff",        name: "崖（岩）",     cat: "地形", geom: "line",  style: { stroke: "#888888",   w: 3, z: 6 } },
  { id: "cliff-soil",   name: "崖（土）",     cat: "地形", geom: "line",  style: { stroke: "#aaa888",   w: 3, z: 6, dash: [6, 3] } },
  { id: "dike",         name: "土手",         cat: "地形", geom: "line",  style: { stroke: "#aa8844",   w: 4, z: 7 } },
  { id: "embankment",   name: "盛土",         cat: "地形", geom: "line",  style: { stroke: "#aa8844",   w: 4, z: 7 } },
  { id: "cut",          name: "切土",         cat: "地形", geom: "line",  style: { stroke: "#aa8844",   w: 3, z: 7, dash: [5, 3] } },
  { id: "levee",        name: "防波堤",       cat: "地形", geom: "line",  style: { stroke: "#888888", casing: "#444444", w: 5, z: 13 } },
  { id: "sand",         name: "砂地",         cat: "地形", geom: "area",  style: { fill: "#eeeecc", stroke: "#ddddaa", sw: 1, z: 5, pattern: "pat-sand" } },
  { id: "gravel",       name: "礫地",         cat: "地形", geom: "area",  style: { fill: "#ddddcc", stroke: "#ccccaa", sw: 1, z: 5 } },
  { id: "rock",         name: "岩地",         cat: "地形", geom: "area",  style: { fill: "#ccccbb", stroke: "#bbbbaa", sw: 1, z: 5 } },
  { id: "wetland",      name: "湿地",         cat: "地形", geom: "area",  style: { fill: "#c8dde0", stroke: "#88aabb", sw: 1, z: 5, pattern: "pat-wetland" } },
  { id: "saltflat",     name: "干潟",         cat: "地形", geom: "area",  style: { fill: "#dde8e0", stroke: "#aabbaa", sw: 1, z: 5 } },
  { id: "snowfield",    name: "雪・氷河",     cat: "地形", geom: "area",  style: { fill: "#eeeeff", stroke: "#aaaacc", sw: 1, z: 5 } },
  { id: "lava",         name: "溶岩",         cat: "地形", geom: "area",  style: { fill: "#ddbbbb", stroke: "#bb8888", sw: 1, z: 5 } },

  // ── 建物 (Buildings) ─────────────────────────────────────────────────────────
  { id: "building",       name: "建物",       cat: "建物", geom: "rect", style: { fill: "#d8c8b8", stroke: "#888878", sw: 1, z: 16 } },
  { id: "imp-bld",        name: "重要施設",   cat: "建物", geom: "rect", style: { fill: "#c8b8a8", stroke: "#666656", sw: 2, z: 17 } },
  { id: "shrine-bld",     name: "神社・寺",   cat: "建物", geom: "rect", style: { fill: "#ddc8b8", stroke: "#886858", sw: 1, z: 16 } },
  { id: "ruin-bld",       name: "廃屋",       cat: "建物", geom: "rect", style: { fill: "#cccccc", stroke: "#888888", sw: 1, z: 15, dash: [5, 3] } },
  { id: "greenhouse-bld", name: "温室建物",   cat: "建物", geom: "rect", style: { fill: "#d8eee8", stroke: "#88aaaa", sw: 1, z: 16 } },
  { id: "tank",           name: "タンク",     cat: "建物", geom: "area", style: { fill: "#ccddcc", stroke: "#88aa88", sw: 2, z: 16 } },
  { id: "wall-bld",       name: "塀・垣",     cat: "建物", geom: "line", style: { stroke: "#888888", w: 2, z: 18 } },
  { id: "fence",          name: "フェンス",   cat: "建物", geom: "line", style: { stroke: "#999999", w: 1, z: 18, dash: [4, 3] } },

  // ── 施設（点）(Point facilities) ──────────────────────────────────────────────
  { id: "cityhall",    name: "市区町村役場", cat: "施設（点）", geom: "point", style: { sym: "cityhall",    color: "#222222", size: 14, z: 84 } },
  { id: "prefoffice",  name: "都道府県庁",   cat: "施設（点）", geom: "point", style: { sym: "prefoffice",  color: "#222222", size: 14, z: 85 } },
  { id: "police",      name: "警察署",       cat: "施設（点）", geom: "point", style: { sym: "police",      color: "#222288", size: 12, z: 83 } },
  { id: "fire",        name: "消防署",       cat: "施設（点）", geom: "point", style: { sym: "fire",        color: "#882222", size: 12, z: 83 } },
  { id: "hospital",    name: "病院",         cat: "施設（点）", geom: "point", style: { sym: "hospital",    color: "#cc2222", size: 12, z: 83 } },
  { id: "clinic",      name: "診療所",       cat: "施設（点）", geom: "point", style: { sym: "clinic",      color: "#cc2222", size: 10, z: 82 } },
  { id: "elderly",     name: "老人ホーム",   cat: "施設（点）", geom: "point", style: { sym: "elderly",     color: "#226622", size: 12, z: 82 } },
  { id: "school",      name: "学校",         cat: "施設（点）", geom: "point", style: { sym: "school",      color: "#222222", size: 12, z: 82 } },
  { id: "university",  name: "大学",         cat: "施設（点）", geom: "point", style: { sym: "university",  color: "#222222", size: 14, z: 83 } },
  { id: "library",     name: "図書館",       cat: "施設（点）", geom: "point", style: { sym: "library",     color: "#222222", size: 12, z: 82 } },
  { id: "museum",      name: "博物館",       cat: "施設（点）", geom: "point", style: { sym: "museum",      color: "#222222", size: 12, z: 82 } },
  { id: "postoffice",  name: "郵便局",       cat: "施設（点）", geom: "point", style: { sym: "postoffice",  color: "#cc0000", size: 12, z: 82 } },
  { id: "station",     name: "駅",           cat: "施設（点）", geom: "point", style: { sym: "station",     color: "#222222", size: 14, z: 84 } },
  { id: "port",        name: "港",           cat: "施設（点）", geom: "point", style: { sym: "port",        color: "#224488", size: 14, z: 83 } },
  { id: "airport",     name: "空港",         cat: "施設（点）", geom: "point", style: { sym: "airport",     color: "#224488", size: 16, z: 84 } },
  { id: "factory",     name: "工場",         cat: "施設（点）", geom: "point", style: { sym: "factory",     color: "#444444", size: 12, z: 82 } },
  { id: "power",       name: "発電所",       cat: "施設（点）", geom: "point", style: { sym: "power",       color: "#cc8800", size: 12, z: 82 } },
  { id: "substation",  name: "変電所",       cat: "施設（点）", geom: "point", style: { sym: "substation",  color: "#cc8800", size: 12, z: 82 } },
  { id: "chimney",     name: "煙突",         cat: "施設（点）", geom: "point", style: { sym: "chimney-pt",  color: "#444444", size: 10, z: 81 } },
  { id: "court",       name: "裁判所",       cat: "施設（点）", geom: "point", style: { sym: "court",       color: "#222222", size: 12, z: 82 } },
  { id: "tax",         name: "税務署",       cat: "施設（点）", geom: "point", style: { sym: "tax",         color: "#222222", size: 12, z: 82 } },
  { id: "health",      name: "保健所",       cat: "施設（点）", geom: "point", style: { sym: "health",      color: "#226622", size: 12, z: 82 } },
  { id: "jsdf",        name: "自衛隊",       cat: "施設（点）", geom: "point", style: { sym: "jsdf",        color: "#226622", size: 12, z: 82 } },

  // ── 施設（面）(Area facilities) ────────────────────────────────────────────────
  { id: "bld-hospital", name: "病院建物",   cat: "施設（面）", geom: "area", style: { fill: "#f0cccc", stroke: "#cc4444", sw: 1, z: 18 } },
  { id: "bld-school",   name: "学校建物",   cat: "施設（面）", geom: "area", style: { fill: "#ccddcc", stroke: "#448844", sw: 1, z: 18 } },
  { id: "bld-station",  name: "駅舎",       cat: "施設（面）", geom: "area", style: { fill: "#c8c8c8", stroke: "#444444", sw: 1, z: 17 } },
  { id: "bld-factory",  name: "工場敷地",   cat: "施設（面）", geom: "area", style: { fill: "#ddd8cc", stroke: "#888880", sw: 1, z: 15 } },
  { id: "bld-airport",  name: "空港敷地",   cat: "施設（面）", geom: "area", style: { fill: "#dde0cc", stroke: "#889968", sw: 1, z: 15 } },
  { id: "bld-port",     name: "港湾敷地",   cat: "施設（面）", geom: "area", style: { fill: "#ccd8dd", stroke: "#688899", sw: 1, z: 15 } },
  { id: "bld-park",     name: "公園",       cat: "施設（面）", geom: "area", style: { fill: "#d0e8c8", stroke: "#88aa80", sw: 1, z: 15 } },
  { id: "bld-cemetery", name: "墓地",       cat: "施設（面）", geom: "area", style: { fill: "#ddd8d0", stroke: "#aaa890", sw: 1, z: 15 } },
  { id: "bld-military", name: "自衛隊敷地", cat: "施設（面）", geom: "area", style: { fill: "#d8e8c8", stroke: "#88aa78", sw: 1, z: 15 } },

  // ── 行政境界 (Admin borders) ──────────────────────────────────────────────────
  { id: "bord-nat",  name: "国境",       cat: "行政境界", geom: "line", style: { stroke: "#444488", w: 3, z: 72, dash: [12, 6] } },
  { id: "bord-pref", name: "都道府県界", cat: "行政境界", geom: "line", style: { stroke: "#444488", w: 2, z: 70, dash: [8,  5] } },
  { id: "bord-city", name: "市区町村界", cat: "行政境界", geom: "line", style: { stroke: "#446688", w: 2, z: 69, dash: [5,  5] } },
  { id: "bord-ward", name: "区界",       cat: "行政境界", geom: "line", style: { stroke: "#446688", w: 1, z: 68, dash: [4,  4] } },
  { id: "bord-town", name: "町丁目界",   cat: "行政境界", geom: "line", style: { stroke: "#6688aa", w: 1, z: 67, dash: [3,  4] } },

  // ── 行政区分 (Admin areas) ────────────────────────────────────────────────────
  { id: "adm-nat",  name: "国",       cat: "行政区分", geom: "admin", style: { fill: "#eeeeee22", stroke: "#444488", sw: 2, z: 1 } },
  { id: "adm-pref", name: "都道府県", cat: "行政区分", geom: "admin", style: { fill: "#ddddff22", stroke: "#444488", sw: 2, z: 2 } },
  { id: "adm-city", name: "市区町村", cat: "行政区分", geom: "admin", style: { fill: "#ccccff22", stroke: "#446688", sw: 1, z: 2 } },

  // ── 地図記号 (Map symbols) ────────────────────────────────────────────────────
  { id: "triangle",      name: "三角点",     cat: "地図記号", geom: "point", style: { sym: "triangle",      color: "#000000", size: 10, z: 88 } },
  { id: "triangle_e",    name: "電子基準点", cat: "地図記号", geom: "point", style: { sym: "triangle_e",    color: "#000000", size: 10, z: 88 } },
  { id: "benchmark",     name: "水準点",     cat: "地図記号", geom: "point", style: { sym: "benchmark",     color: "#000000", size: 10, z: 87 } },
  { id: "shrine-sym",    name: "神社",       cat: "地図記号", geom: "point", style: { sym: "shrine-sym",    color: "#cc4400", size: 12, z: 86 } },
  { id: "temple-sym",    name: "寺院",       cat: "地図記号", geom: "point", style: { sym: "temple-sym",    color: "#222222", size: 12, z: 86 } },
  { id: "church-sym",    name: "キリスト教会", cat: "地図記号", geom: "point", style: { sym: "church-sym",  color: "#222222", size: 12, z: 86 } },
  { id: "peak",          name: "山頂",       cat: "地図記号", geom: "point", style: { sym: "peak",          color: "#553311", size: 12, z: 85 } },
  { id: "volcano",       name: "火山",       cat: "地図記号", geom: "point", style: { sym: "volcano",       color: "#cc4400", size: 14, z: 85 } },
  { id: "lighthouse",    name: "灯台",       cat: "地図記号", geom: "point", style: { sym: "lighthouse",    color: "#224488", size: 12, z: 84 } },
  { id: "dam-sym",       name: "ダム",       cat: "地図記号", geom: "point", style: { sym: "dam-sym",       color: "#444444", size: 14, z: 84 } },
  { id: "mine-sym",      name: "採石地",     cat: "地図記号", geom: "point", style: { sym: "mine-sym",      color: "#666666", size: 12, z: 83 } },
  { id: "castle-sym",    name: "城跡",       cat: "地図記号", geom: "point", style: { sym: "castle-sym",    color: "#444444", size: 12, z: 83 } },
  { id: "ruins-sym",     name: "遺跡",       cat: "地図記号", geom: "point", style: { sym: "ruins-sym",     color: "#664422", size: 12, z: 83 } },
  { id: "historic",      name: "史跡",       cat: "地図記号", geom: "point", style: { sym: "historic",      color: "#664422", size: 12, z: 83 } },
  { id: "cemetery-sym",  name: "墓地記号",   cat: "地図記号", geom: "point", style: { sym: "cemetery-sym",  color: "#444444", size: 12, z: 82 } },
  { id: "hotspring-sym", name: "温泉記号",   cat: "地図記号", geom: "point", style: { sym: "hotspring-sym", color: "#cc4444", size: 12, z: 82 } },
];

export const CATALOG_BY_ID: Record<string, CatalogItem> = Object.fromEntries(
  CATALOG.map((c) => [c.id, c])
);

export const CATEGORIES: string[] = [...new Set(CATALOG.map((c) => c.cat))];

export function getCatalogByCategory(cat: string): CatalogItem[] {
  return CATALOG.filter((c) => c.cat === cat);
}
