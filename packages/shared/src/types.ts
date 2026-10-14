// ───────────────────────────────────────────────────────────────────────────────
// MapCraft v2 コア型定義（docs/v2-implementation.md §2.1 準拠）
// 1 world unit = 1 m。原点キャンバス中央、X=東、Y=南（下向き正）
// この型と catalog の ID 体系は M1 完了時点で凍結（変更は docs/v2-decisions.md 必須）
// ───────────────────────────────────────────────────────────────────────────────

export type Geom = "line" | "area" | "admin" | "rect" | "point" | "text";

export interface Point {
  x: number; // world (m)
  y: number; // world (m)
}

export interface StyleDef {
  stroke?: string;      // CSS color
  casing?: string;      // 道路の縁取り色
  w?: number;           // 線幅 (world m)
  dash?: number[];      // [on, off] (world m)
  rail?: boolean;       // 枕木自動生成
  fill?: string;
  sw?: number;          // エリア枠線幅 (world m)
  pattern?: string;     // パターン充填ID（植生・地形エリア用）
  sym?: string;         // symbolPaths のキー
  color?: string;       // 記号・テキスト色
  size?: number;        // 記号サイズ (screen px 固定)
  z?: number;           // Zオーダー: エリア1-5 地形線6-14 建物15-18 水系19-25 道路30-50 鉄道51-65 行政境界67-72 点記号80+ テキスト90+
}

export interface CatalogItem {
  id: string;
  name: string;         // 日本語表示名
  cat: string;          // カテゴリID（11分類）
  geom: Exclude<Geom, "text">;
  style: StyleDef;
}

export interface MapObject {
  id: string;                        // crypto.randomUUID()
  geom: Geom;
  itemId: string;                    // CatalogItem.id。geom==="text" のときは "text"
  pts?: Point[];                     // line / area / admin / rect（rectは対角2点）
  pt?: Point;                        // point / text のアンカー
  styleOverride?: Partial<StyleDef>; // 実効スタイル = catalog.style と shallow merge
  name?: string;                     // 付随ラベル文字列
  showLabel?: boolean;               // 付随ラベル表示（default false、admin は true）
  text?: string;                     // geom==="text" の本文（\n 区切り複数行可）
  fontSize?: number;                 // world m。default 100
  orientation?: "h" | "v";           // 横書き/縦書き。default "h"
  mode?: "straight" | "curve";
  layerId: string;
  locked?: boolean;
  visible?: boolean;                 // default true
  createdAt: number;
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  minS: number;         // vt.s < minS で非表示
  maxS: number;         // vt.s > maxS で非表示（無制限は MAX_S）
}

export interface ViewTransform {
  x: number; // translate X (screen px)
  y: number; // translate Y (screen px)
  s: number; // scale (px / m)
}

export type LinkRole = "view" | "edit";
export type MapRole = "owner" | LinkRole;

export interface MapMeta {
  id: string;
  name: string;
  description?: string;
  thumbnailUrl?: string;
  createdAt: string;
  updatedAt: string;
  myRole: MapRole;
}

// ─── スタイル解決・レイヤー既定値 ────────────────────────────────────────────

export const TEXT_ITEM_ID = "text";
export const TEXT_BASE_STYLE: StyleDef = { color: "#333333", z: 90 };

export function effectiveStyle(
  obj: MapObject,
  catalogById: Record<string, CatalogItem>
): StyleDef {
  const base =
    obj.geom === "text" ? TEXT_BASE_STYLE : (catalogById[obj.itemId]?.style ?? {});
  return { ...base, ...obj.styleOverride };
}

export const MAX_S = 1e9;

export const DEFAULT_LAYERS: Layer[] = [
  { id: "terrain", name: "地形", visible: true, locked: false, minS: 0, maxS: MAX_S },
  { id: "water", name: "水系", visible: true, locked: false, minS: 0, maxS: MAX_S },
  { id: "vegetation", name: "植生", visible: true, locked: false, minS: 0, maxS: MAX_S },
  { id: "buildings", name: "建物・施設", visible: true, locked: false, minS: 0, maxS: MAX_S },
  { id: "transport", name: "交通", visible: true, locked: false, minS: 0, maxS: MAX_S },
  { id: "admin", name: "行政", visible: true, locked: false, minS: 0, maxS: MAX_S },
  { id: "annotation", name: "注記", visible: true, locked: false, minS: 0, maxS: MAX_S },
];

const CAT_TO_LAYER: Record<string, string> = {
  地形: "terrain",
  水系: "water",
  植生: "vegetation",
  建物: "buildings",
  "施設（点）": "buildings",
  "施設（面）": "buildings",
  地図記号: "buildings",
  道路: "transport",
  鉄道: "transport",
  行政境界: "admin",
  行政区分: "admin",
};

export function defaultLayerFor(item: CatalogItem): string {
  return CAT_TO_LAYER[item.cat] ?? "buildings";
}
