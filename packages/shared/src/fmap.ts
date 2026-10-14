import { z } from "zod";
import type { Layer, MapObject } from "./types.js";

// ───────────────────────────────────────────────────────────────────────────────
// .fmap v2 形式（v2-implementation.md §M9）
// { "format": "fmap", "version": 2, "exportedAt": "<ISO8601>", "name": "<マップ名>",
//   "layers": [Layer...], "layerOrder": ["id"...], "objects": [MapObject...] }
// 外部境界（ファイルインポート）なので zod でパースする。
// ───────────────────────────────────────────────────────────────────────────────

const pointSchema = z.object({ x: z.number(), y: z.number() });

const styleDefSchema = z.object({
  stroke: z.string().optional(),
  casing: z.string().optional(),
  w: z.number().optional(),
  dash: z.array(z.number()).optional(),
  rail: z.boolean().optional(),
  fill: z.string().optional(),
  sw: z.number().optional(),
  pattern: z.string().optional(),
  sym: z.string().optional(),
  color: z.string().optional(),
  size: z.number().optional(),
  z: z.number().optional(),
});

const mapObjectSchema = z.object({
  id: z.string(),
  geom: z.enum(["line", "area", "admin", "rect", "point", "text"]),
  itemId: z.string(),
  pts: z.array(pointSchema).optional(),
  pt: pointSchema.optional(),
  styleOverride: styleDefSchema.optional(),
  name: z.string().optional(),
  showLabel: z.boolean().optional(),
  text: z.string().optional(),
  fontSize: z.number().optional(),
  orientation: z.enum(["h", "v"]).optional(),
  mode: z.enum(["straight", "curve"]).optional(),
  layerId: z.string(),
  locked: z.boolean().optional(),
  visible: z.boolean().optional(),
  createdAt: z.number(),
});

const layerSchema = z.object({
  id: z.string(),
  name: z.string(),
  visible: z.boolean(),
  locked: z.boolean(),
  minS: z.number(),
  maxS: z.number(),
});

export const fmapSchema = z.object({
  format: z.literal("fmap"),
  version: z.literal(2),
  exportedAt: z.string(),
  name: z.string(),
  layers: z.array(layerSchema),
  layerOrder: z.array(z.string()),
  objects: z.array(mapObjectSchema),
});

export interface FmapFile {
  format: "fmap";
  version: 2;
  exportedAt: string; // ISO8601
  name: string;
  layers: Layer[];
  layerOrder: string[];
  objects: MapObject[];
}

// .fmap の内容を検証してパースする。不正なら throw（ZodError / SyntaxError）。
// 文字列（ファイル本文そのまま）と、既に JSON.parse 済みの値の両方を受け付ける。
export function parseFmap(json: unknown): FmapFile {
  const value: unknown = typeof json === "string" ? JSON.parse(json) : json;
  // zod の出力型は optional キーが `T | undefined` になり exactOptionalPropertyTypes
  // 下で MapObject と正確に一致しないため、実行時検証済みの値をキャストして返す。
  return fmapSchema.parse(value) as FmapFile;
}

// .fmap の JSON 文字列を生成する（エクスポート用。exportedAt は現在時刻）。
export function serializeFmap(data: {
  name: string;
  layers: Layer[];
  layerOrder: string[];
  objects: MapObject[];
}): string {
  const file: FmapFile = {
    format: "fmap",
    version: 2,
    exportedAt: new Date().toISOString(),
    name: data.name,
    layers: data.layers,
    layerOrder: data.layerOrder,
    objects: data.objects,
  };
  return JSON.stringify(file, null, 2);
}
