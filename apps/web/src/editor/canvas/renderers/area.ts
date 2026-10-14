// area / admin ジオメトリのレンダラ（実装書 §3.3・§3.4・§M6-2）。
// 塗り+枠線、パターン充填（TilingSprite をポリゴン形状でマスク）、
// area/admin の付随ラベル（centroid・world 固定サイズ）を担当。
import { Container, Graphics, Text } from "pixi.js";
import type { MapObject, StyleDef } from "@mapcraft/shared";
import { bbox, maybeSmooth, polygonCentroid } from "@mapcraft/shared";
import type { PatternRegistry } from "../PatternRegistry.js";
import { haloTextStyle } from "./labelStyle.js";

// 付随ラベルの fontSize（world m）: エリア bbox 幅の 1/10、ただし 40m〜400m にクランプ
// （実装書 §M6-2）。
const LABEL_MIN_FONT = 40;
const LABEL_MAX_FONT = 400;

export function renderArea(
  obj: MapObject,
  style: StyleDef,
  vtS: number,
  patternRegistry: PatternRegistry
): Container {
  const container = new Container();
  if (!obj.pts || obj.pts.length < 3) return container;
  const pts = maybeSmooth(obj.pts, obj.geom, obj.mode);

  const flat: number[] = [];
  for (const p of pts) flat.push(p.x, p.y);

  const g = new Graphics();
  g.poly(flat, true);
  if (style.fill) g.fill({ color: style.fill });
  if (style.sw) g.stroke({ width: style.sw, color: style.stroke ?? "#000000" });
  container.addChild(g);

  if (style.pattern) {
    const bb = bbox(pts);
    const tiling = patternRegistry.createTilingSprite(
      style.pattern,
      style.color ?? style.stroke ?? "#000000",
      vtS,
      bb.minX,
      bb.minY,
      Math.max(1e-3, bb.maxX - bb.minX),
      Math.max(1e-3, bb.maxY - bb.minY)
    );
    if (tiling) {
      const maskShape = new Graphics();
      maskShape.poly(flat, true).fill(0xffffff);
      container.addChild(maskShape);
      tiling.mask = maskShape;
      container.addChild(tiling);
    }
  }

  if ((obj.geom === "area" || obj.geom === "admin") && obj.showLabel && obj.name) {
    const c = polygonCentroid(pts);
    const bb = bbox(pts);
    const fontSize = Math.min(LABEL_MAX_FONT, Math.max(LABEL_MIN_FONT, (bb.maxX - bb.minX) / 10));
    const label = new Text({ text: obj.name, style: haloTextStyle(fontSize, style.stroke ?? "#222244") });
    label.anchor.set(0.5);
    label.position.set(c.x, c.y);
    container.addChild(label);
  }

  return container;
}
