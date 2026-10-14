// line ジオメトリのレンダラ（実装書 §3.3・§M6-2）。
// casing → 本線の2パス、鉄道枕木、破線分解、線幅クランプ、付随ラベル（密化後中点・水平）を担当。
// 純粋関数: 1オブジェクト → Container。world 座標系で描画（親の worldRoot が vt.s でスケール）。
import { Container, Graphics, Text } from "pixi.js";
import type { MapObject, Point, StyleDef } from "@mapcraft/shared";
import { bbox, dashSegments, maybeSmooth, sleepers } from "@mapcraft/shared";
import { haloTextStyle } from "./labelStyle.js";

const CASING_RATIO = 1.4; // casing（縁取り）は本線幅の1.4倍
const MIN_SCREEN_PX = 0.75; // ズームアウトしてもこれ未満にならない

// クランプ後の実効線幅。PixiApp のズーム時再構築判定と描画本体で同一式を共有する。
export function effectiveLineWidth(style: StyleDef, vtS: number): number {
  return Math.max(style.w ?? 2, MIN_SCREEN_PX / vtS);
}
// 付随ラベルの fontSize（world m）: bbox の長辺の 1/10、40m〜400mにクランプ
// （実装書 §M6-2 は area/admin の基準を明記。line は明記が無いため area と同じ
// クランプ幅を、線の bbox 長辺基準で流用する＝妥当なデフォルトとして採用）。
const LABEL_MIN_FONT = 40;
const LABEL_MAX_FONT = 400;

// 密化後点列の弧長中点（実装書 §M6-2: line の付随ラベル位置）。
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

export function renderLine(obj: MapObject, style: StyleDef, vtS: number): Container {
  const container = new Container();
  if (!obj.pts || obj.pts.length < 2) return container;

  const pts = maybeSmooth(obj.pts, obj.geom, obj.mode);
  const w = effectiveLineWidth(style, vtS);
  const strokeColor = style.stroke ?? "#000000";
  const g = new Graphics();

  const drawPath = (segments: { x: number; y: number }[]) => {
    if (segments.length < 2) return;
    g.moveTo(segments[0]!.x, segments[0]!.y);
    for (let i = 1; i < segments.length; i++) g.lineTo(segments[i]!.x, segments[i]!.y);
  };

  // casing（縁取り。本線より先に描いて下に敷く）
  if (style.casing) {
    drawPath(pts);
    g.stroke({ width: w * CASING_RATIO, color: style.casing, cap: "round", join: "round" });
  }

  // 本線（破線指定があれば dashSegments で分解して描画。Pixi v8 にネイティブ破線は無い）
  if (style.dash && style.dash.length === 2) {
    const [on = 8, off = 4] = style.dash;
    for (const seg of dashSegments(pts, [on, off])) {
      drawPath(seg);
      g.stroke({ width: w, color: strokeColor, cap: "round", join: "round" });
    }
  } else {
    drawPath(pts);
    g.stroke({ width: w, color: strokeColor, cap: "round", join: "round" });
  }

  // 鉄道枕木: spacing = w*3, len = w*2（world）
  if (style.rail) {
    const railColor = style.casing ?? strokeColor;
    for (const [a, b] of sleepers(pts, w * 3, w * 2)) {
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: w * 0.3, color: railColor, cap: "butt" });
    }
  }

  container.addChild(g);

  if (obj.showLabel && obj.name) {
    const bb = bbox(pts);
    const fontSize = Math.min(
      LABEL_MAX_FONT,
      Math.max(LABEL_MIN_FONT, Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) / 10)
    );
    const mid = polylineMidpoint(pts);
    const label = new Text({ text: obj.name, style: haloTextStyle(fontSize, strokeColor) });
    label.anchor.set(0.5);
    label.position.set(mid.x, mid.y);
    container.addChild(label);
  }

  return container;
}
