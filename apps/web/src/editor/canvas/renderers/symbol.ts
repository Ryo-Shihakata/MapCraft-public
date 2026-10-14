// point ジオメトリ（記号）のレンダラ（実装書 §3.2・§3.5・§M6-2）。
// SYMBOL_PATHS（24×24 viewBox）を GraphicsPath で描画。見た目サイズは style.size px 固定
// （スクリーン固定）: container.scale = size/24/vtS。vtS 変化時は PixiApp が scale を再設定する。
// 付随ラベルも同じ container の子とすることで、この一括スケール補正に自動的に乗る
// （合成スケール = vt.s * size/(24*vtS) = size/24 で vt.s に依存せず常に一定になる）。
import { Container, Graphics, GraphicsPath, Text } from "pixi.js";
import type { MapObject, StyleDef } from "@mapcraft/shared";
import { SYMBOL_PATHS } from "@mapcraft/shared";
import { haloTextStyle } from "./labelStyle.js";

const SYMBOL_VIEWBOX = 24;
const LABEL_SCREEN_PX = 12; // 記号ラベルのスクリーン固定サイズ（実装書 §M6-2）
const LABEL_OFFSET_SCREEN_RATIO = 0.7; // オフセット = size*0.7 screen px 相当

export function symbolScale(style: StyleDef, vtS: number): number {
  const size = style.size ?? 12;
  return size / SYMBOL_VIEWBOX / vtS;
}

export function renderSymbol(obj: MapObject, style: StyleDef, vtS: number): Container {
  const container = new Container();
  if (!obj.pt || !style.sym) return container;
  const def = SYMBOL_PATHS[style.sym];
  if (!def) return container;

  const g = new Graphics();
  const path = new GraphicsPath(def.d);
  const color = style.color ?? "#000000";
  if (def.strokeOnly) {
    g.path(path).stroke({ width: 1.8, color, cap: "round", join: "round" });
  } else {
    g.path(path).fill(color);
  }
  g.pivot.set(12, 12); // 24x24 の中心を原点に

  container.addChild(g);

  if (obj.showLabel && obj.name) {
    const size = style.size ?? 12;
    // container.scale = size/(24*vtS) が既に乗るので、ここでのローカル値は
    // その逆数（24/size）を掛けた「container.scale後にscreen px相当になる値」を使う。
    const labelFontSize = (LABEL_SCREEN_PX * SYMBOL_VIEWBOX) / size;
    const offsetLocal = LABEL_OFFSET_SCREEN_RATIO * SYMBOL_VIEWBOX; // size で相殺されるため定数
    const label = new Text({
      text: obj.name,
      style: { ...haloTextStyle(labelFontSize, style.color ?? "#222222"), align: "left" },
    });
    label.anchor.set(0, 0.5);
    label.position.set(offsetLocal, 0);
    container.addChild(label);
  }

  container.position.set(obj.pt.x, obj.pt.y);
  container.scale.set(symbolScale(style, vtS));
  return container;
}
