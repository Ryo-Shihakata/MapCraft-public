// SVG エクスポート（実装書 §M9-3）。Pixi 非依存の純関数。
// apps/web/src/editor/canvas/renderers/*.ts と同じ描画規則を、Pixi Graphics ではなく
// SVG 要素として再実装する。ジオメトリ計算・記号定義は packages/shared の単一ソース
// （SYMBOL_PATHS / sleepers 等）を再利用し、Pixi 描画と原理的に一致させる。
//
// 座標系: viewBox は world m 単位そのまま（1 unit = 1m）。width/height 属性のみ
// `opts.pxPerMeter` で px 換算する。記号・パターン・線幅クランプ・付随ラベルの
// フォントサイズは、renderers 側の「スクリーン固定」量を再現するため
// `opts.pxPerMeter` を Pixi の vt.s の代役として使う（呼び出し側は通常、現在の
// ビュー縮尺 vt.s をそのまま渡す）。
import type { BBox, CatalogItem, Layer, MapObject, Point, StyleDef } from "@mapcraft/shared";
import { bbox, effectiveStyle, maybeSmooth, polygonCentroid, sleepers, SYMBOL_PATHS } from "@mapcraft/shared";
import { LABEL_FONT_FAMILY } from "../editor/canvas/renderers/labelStyle.js";

export interface SvgExportOptions {
  bbox: BBox; // 出力範囲（world m）
  pxPerMeter: number; // 出力解像度換算 & スクリーン固定量の基準（= 通常は現在の vt.s）
  scale: number; // レイヤー minS/maxS 判定に使う「現在の縮尺」（vt.s）
  backgroundColor?: string; // 既定 #f7f5f0（紙色）
}

const CASING_RATIO = 1.4;
const MIN_SCREEN_PX = 0.75;
const LABEL_MIN_FONT = 40;
const LABEL_MAX_FONT = 400;
const SYMBOL_LABEL_SCREEN_PX = 12;
const SYMBOL_LABEL_OFFSET_RATIO = 0.7;
const TEXT_LINE_HEIGHT_RATIO = 1.25;
const TEXT_COLUMN_GAP_RATIO = 1.15;
const PATTERN_TILE_SIZE = 48; // Pixi PatternRegistry の TILE_SIZE と同一（screen px 相当）
const PATTERN_GLYPH_SIZE = 24; // 同 GLYPH_SIZE

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmt(n: number): string {
  // 小数第3位までに丸めて出力を安定させる（浮動小数の桁あふれ防止）。
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, "");
}

function pointsAttr(pts: Point[]): string {
  return pts.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(" ");
}

// line.ts の polylineMidpoint と同じ規則（密化後点列の弧長中点）。
function polylineMidpoint(pts: Point[]): Point {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return pts[0]!;
  const segLens: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.y - pts[i]!.y);
    segLens.push(len);
    total += len;
  }
  let target = total / 2;
  for (let i = 0; i < segLens.length; i++) {
    const len = segLens[i]!;
    if (target <= len) {
      const t = len > 0 ? target / len : 0;
      const a = pts[i]!,
        b = pts[i + 1]!;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    target -= len;
  }
  return pts[pts.length - 1]!;
}

function clampFont(raw: number): number {
  return Math.min(LABEL_MAX_FONT, Math.max(LABEL_MIN_FONT, raw));
}

function haloTextAttrs(fontSize: number, color: string): string {
  const strokeWidth = fontSize * 0.15;
  return `font-family="${LABEL_FONT_FAMILY.replace(/"/g, "&quot;")}" font-size="${fmt(fontSize)}" fill="${xmlEscape(
    color
  )}" stroke="#ffffff" stroke-width="${fmt(strokeWidth)}" paint-order="stroke" stroke-linejoin="round"`;
}

function isLayerHidden(obj: MapObject, layer: Layer | undefined, scale: number): boolean {
  if (obj.visible === false) return true;
  if (!layer) return true;
  if (!layer.visible) return true;
  if (scale < layer.minS || scale > layer.maxS) return true;
  return false;
}

function colorSlug(color: string): string {
  const slug = color.replace(/[^a-zA-Z0-9]/g, "");
  return slug.length > 0 ? slug : "c";
}

interface RenderCtx {
  parts: string[];
  defs: string[];
  usedSymbols: Set<string>;
  usedPatterns: Set<string>;
  pxPerMeter: number;
}

function ensureSymbolDef(ctx: RenderCtx, sym: string): void {
  if (ctx.usedSymbols.has(sym)) return;
  const def = SYMBOL_PATHS[sym];
  if (!def) return;
  ctx.usedSymbols.add(sym);
  ctx.defs.push(`<path id="sym-${xmlEscape(sym)}" d="${xmlEscape(def.d)}" />`);
}

function ensurePatternDef(ctx: RenderCtx, patternId: string, color: string): string {
  const key = `${patternId}::${color}`;
  // patternId は catalog 上ですでに "pat-" プレフィックス済み（例: "pat-forest"）のため二重に付けない。
  const id = `${xmlEscape(patternId)}-fill-${colorSlug(color)}`;
  if (ctx.usedPatterns.has(key)) return id;
  ctx.usedPatterns.add(key);
  ensureSymbolDef(ctx, patternId);
  const tileSize = PATTERN_TILE_SIZE / ctx.pxPerMeter;
  const glyphSize = PATTERN_GLYPH_SIZE / ctx.pxPerMeter;
  const offset = (tileSize - glyphSize) / 2;
  const def = SYMBOL_PATHS[patternId];
  const scale = glyphSize / 24;
  const styleAttr = def?.strokeOnly
    ? `fill="none" stroke="${xmlEscape(color)}" stroke-width="1.6"`
    : `fill="${xmlEscape(color)}"`;
  ctx.defs.push(
    `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${fmt(tileSize)}" height="${fmt(tileSize)}">` +
      `<use href="#sym-${xmlEscape(patternId)}" transform="translate(${fmt(offset)} ${fmt(offset)}) scale(${fmt(scale)})" ${styleAttr} />` +
      `</pattern>`
  );
  return id;
}

function renderLineObject(ctx: RenderCtx, obj: MapObject, style: StyleDef): void {
  if (!obj.pts || obj.pts.length < 2) return;
  const pts = maybeSmooth(obj.pts, obj.geom, obj.mode);
  const w = Math.max(style.w ?? 2, MIN_SCREEN_PX / ctx.pxPerMeter);
  const strokeColor = style.stroke ?? "#000000";
  const pointsStr = pointsAttr(pts);

  if (style.casing) {
    ctx.parts.push(
      `<polyline points="${pointsStr}" fill="none" stroke="${xmlEscape(style.casing)}" stroke-width="${fmt(
        w * CASING_RATIO
      )}" stroke-linecap="round" stroke-linejoin="round" />`
    );
  }

  const dashAttr =
    style.dash && style.dash.length === 2 ? ` stroke-dasharray="${fmt(style.dash[0]!)} ${fmt(style.dash[1]!)}"` : "";
  ctx.parts.push(
    `<polyline points="${pointsStr}" fill="none" stroke="${xmlEscape(strokeColor)}" stroke-width="${fmt(
      w
    )}" stroke-linecap="round" stroke-linejoin="round"${dashAttr} />`
  );

  if (style.rail) {
    const railColor = style.casing ?? strokeColor;
    for (const [a, b] of sleepers(pts, w * 3, w * 2)) {
      ctx.parts.push(
        `<line x1="${fmt(a.x)}" y1="${fmt(a.y)}" x2="${fmt(b.x)}" y2="${fmt(b.y)}" stroke="${xmlEscape(
          railColor
        )}" stroke-width="${fmt(w * 0.3)}" stroke-linecap="butt" />`
      );
    }
  }

  if (obj.showLabel && obj.name) {
    const bb = bbox(pts);
    const fontSize = clampFont(Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) / 10);
    const mid = polylineMidpoint(pts);
    ctx.parts.push(
      `<text x="${fmt(mid.x)}" y="${fmt(mid.y)}" text-anchor="middle" dominant-baseline="middle" ${haloTextAttrs(
        fontSize,
        strokeColor
      )}>${xmlEscape(obj.name)}</text>`
    );
  }
}

function renderAreaObject(ctx: RenderCtx, obj: MapObject, style: StyleDef): void {
  if (!obj.pts || obj.pts.length < 3) return;
  const pts = maybeSmooth(obj.pts, obj.geom, obj.mode);
  const pointsStr = pointsAttr(pts);

  const fill = style.fill ?? "none";
  const strokeAttr = style.sw ? ` stroke="${xmlEscape(style.stroke ?? "#000000")}" stroke-width="${fmt(style.sw)}"` : "";
  ctx.parts.push(`<polygon points="${pointsStr}" fill="${xmlEscape(fill)}"${strokeAttr} />`);

  if (style.pattern) {
    const patId = ensurePatternDef(ctx, style.pattern, style.color ?? style.stroke ?? "#000000");
    ctx.parts.push(`<polygon points="${pointsStr}" fill="url(#${patId})" />`);
  }

  if ((obj.geom === "area" || obj.geom === "admin") && obj.showLabel && obj.name) {
    const c = polygonCentroid(pts);
    const bb = bbox(pts);
    const fontSize = clampFont((bb.maxX - bb.minX) / 10);
    ctx.parts.push(
      `<text x="${fmt(c.x)}" y="${fmt(c.y)}" text-anchor="middle" dominant-baseline="middle" ${haloTextAttrs(
        fontSize,
        style.stroke ?? "#222244"
      )}>${xmlEscape(obj.name)}</text>`
    );
  }
}

function renderRectObject(ctx: RenderCtx, obj: MapObject, style: StyleDef): void {
  const pts = obj.pts;
  if (!pts || pts.length < 2) return;
  const [a, b] = pts;
  if (!a || !b) return;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  const fill = style.fill ?? "none";
  const strokeAttr = style.sw ? ` stroke="${xmlEscape(style.stroke ?? "#000000")}" stroke-width="${fmt(style.sw)}"` : "";
  ctx.parts.push(
    `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" fill="${xmlEscape(fill)}"${strokeAttr} />`
  );
}

function renderSymbolObject(ctx: RenderCtx, obj: MapObject, style: StyleDef): void {
  if (!obj.pt || !style.sym) return;
  const def = SYMBOL_PATHS[style.sym];
  if (!def) return;
  ensureSymbolDef(ctx, style.sym);

  const size = style.size ?? 12;
  const worldSize = size / ctx.pxPerMeter;
  const scale = worldSize / 24;
  const color = style.color ?? "#000000";
  const styleAttr = def.strokeOnly
    ? `fill="none" stroke="${xmlEscape(color)}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`
    : `fill="${xmlEscape(color)}"`;
  ctx.parts.push(
    `<use href="#sym-${xmlEscape(style.sym)}" transform="translate(${fmt(obj.pt.x)} ${fmt(
      obj.pt.y
    )}) scale(${fmt(scale)}) translate(-12 -12)" ${styleAttr} />`
  );

  if (obj.showLabel && obj.name) {
    const fontSize = SYMBOL_LABEL_SCREEN_PX / ctx.pxPerMeter;
    const offset = (SYMBOL_LABEL_OFFSET_RATIO * size) / ctx.pxPerMeter;
    ctx.parts.push(
      `<text x="${fmt(obj.pt.x + offset)}" y="${fmt(obj.pt.y)}" text-anchor="start" dominant-baseline="middle" ${haloTextAttrs(
        fontSize,
        color
      )}>${xmlEscape(obj.name)}</text>`
    );
  }
}

function renderTextObject(ctx: RenderCtx, obj: MapObject, style: StyleDef): void {
  if (!obj.pt || !obj.text) return;
  const fontSize = obj.fontSize ?? 100;
  const color = style.color ?? "#333333";
  const strokeWidth = fontSize * 0.15;

  if (obj.orientation === "v") {
    const lines = obj.text.split("\n");
    const colGap = fontSize * TEXT_COLUMN_GAP_RATIO;
    const rowHeight = fontSize * TEXT_LINE_HEIGHT_RATIO;
    const maxRows = Math.max(1, ...lines.map((l) => Array.from(l).length));
    const offsetX = -((lines.length - 1) * colGap) / 2;
    const offsetY = -((maxRows - 1) * rowHeight) / 2;
    lines.forEach((line, colIdx) => {
      const chars = Array.from(line);
      chars.forEach((ch, rowIdx) => {
        const x = obj.pt!.x + offsetX + colIdx * colGap;
        const y = obj.pt!.y + offsetY + rowIdx * rowHeight;
        ctx.parts.push(
          `<text x="${fmt(x)}" y="${fmt(y)}" text-anchor="middle" dominant-baseline="middle" font-family="${LABEL_FONT_FAMILY.replace(
            /"/g,
            "&quot;"
          )}" font-size="${fmt(fontSize)}" fill="${xmlEscape(color)}" stroke="#ffffff" stroke-width="${fmt(
            strokeWidth
          )}" paint-order="stroke" stroke-linejoin="round">${xmlEscape(ch)}</text>`
        );
      });
    });
  } else {
    const lines = obj.text.split("\n");
    const lineHeight = fontSize * TEXT_LINE_HEIGHT_RATIO;
    const startY = obj.pt.y - ((lines.length - 1) * lineHeight) / 2;
    const tspans = lines
      .map(
        (line, i) =>
          `<tspan x="${fmt(obj.pt!.x)}" y="${fmt(startY + i * lineHeight)}">${xmlEscape(line)}</tspan>`
      )
      .join("");
    ctx.parts.push(
      `<text text-anchor="middle" dominant-baseline="middle" font-family="${LABEL_FONT_FAMILY.replace(
        /"/g,
        "&quot;"
      )}" font-size="${fmt(fontSize)}" fill="${xmlEscape(color)}" stroke="#ffffff" stroke-width="${fmt(
        strokeWidth
      )}" paint-order="stroke" stroke-linejoin="round">${tspans}</text>`
    );
  }
}

export function exportSvg(
  objects: MapObject[],
  layers: Layer[],
  catalogById: Record<string, CatalogItem>,
  opts: SvgExportOptions
): string {
  const layerMap = new Map(layers.map((l) => [l.id, l]));
  const visible = objects.filter((obj) => !isLayerHidden(obj, layerMap.get(obj.layerId), opts.scale));
  const withStyle = visible.map((obj) => ({ obj, style: effectiveStyle(obj, catalogById) }));
  withStyle.sort((a, b) => (a.style.z ?? 0) - (b.style.z ?? 0));

  const ctx: RenderCtx = {
    parts: [],
    defs: [],
    usedSymbols: new Set(),
    usedPatterns: new Set(),
    pxPerMeter: opts.pxPerMeter,
  };

  for (const { obj, style } of withStyle) {
    switch (obj.geom) {
      case "line":
        renderLineObject(ctx, obj, style);
        break;
      case "area":
      case "admin":
        renderAreaObject(ctx, obj, style);
        break;
      case "rect":
        renderRectObject(ctx, obj, style);
        break;
      case "point":
        renderSymbolObject(ctx, obj, style);
        break;
      case "text":
        renderTextObject(ctx, obj, style);
        break;
    }
  }

  const { minX, minY, maxX, maxY } = opts.bbox;
  const w = Math.max(1e-6, maxX - minX);
  const h = Math.max(1e-6, maxY - minY);
  const pxW = Math.max(1, Math.round(w * opts.pxPerMeter));
  const pxH = Math.max(1, Math.round(h * opts.pxPerMeter));
  const background = opts.backgroundColor ?? "#f7f5f0";

  const header = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${fmt(
    minX
  )} ${fmt(minY)} ${fmt(w)} ${fmt(h)}" width="${pxW}" height="${pxH}">`;
  const bg = `<rect x="${fmt(minX)}" y="${fmt(minY)}" width="${fmt(w)}" height="${fmt(h)}" fill="${xmlEscape(
    background
  )}" />`;
  const defs = ctx.defs.length > 0 ? `<defs>${ctx.defs.join("")}</defs>` : "";

  return `${header}${defs}${bg}${ctx.parts.join("")}</svg>`;
}
