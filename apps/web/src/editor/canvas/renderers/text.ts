// text ジオメトリ（自由配置テキスト）のレンダラ（実装書 §3.5・§M6-1/2）。
// world 固定（fontSize m がズームに追従。worldRoot が vt.s でスケールするので
// Text 自体は追加のスケール補正なしで良い）。ラベルは白縁取り。アンカーは pt を中心とする。
// 縦書き（orientation:"v"）は \n 区切りの各行を1列として、列内を1文字ずつ上→下に積む
// （列は左→右に並べる）。
// 計測した bbox（world 単位）は textBoundsCache に書き込み、tools/hitTest.ts の
// 暫定判定（文字数×fontSizeの見積もり）をここで実測値に置き換える（実装書 §M6-2）。
import { Container, Text } from "pixi.js";
import type { MapObject, StyleDef } from "@mapcraft/shared";
import { setTextBounds } from "../../tools/textBoundsCache.js";
import { haloTextStyle } from "./labelStyle.js";

const LINE_HEIGHT_RATIO = 1.25;
const COLUMN_GAP_RATIO = 1.15;

export function renderText(obj: MapObject, style: StyleDef): Container {
  const container = new Container();
  if (!obj.pt || !obj.text) return container;

  const fontSize = obj.fontSize ?? 100;
  const color = style.color ?? "#333333";

  if (obj.orientation === "v") {
    const lines = obj.text.split("\n");
    const colGap = fontSize * COLUMN_GAP_RATIO;
    lines.forEach((line, colIdx) => {
      const chars = Array.from(line);
      chars.forEach((ch, rowIdx) => {
        const t = new Text({ text: ch, style: haloTextStyle(fontSize, color) });
        t.anchor.set(0.5);
        t.position.set(colIdx * colGap, rowIdx * fontSize * LINE_HEIGHT_RATIO);
        container.addChild(t);
      });
    });
  } else {
    const t = new Text({
      text: obj.text,
      style: { ...haloTextStyle(fontSize, color), lineHeight: fontSize * LINE_HEIGHT_RATIO },
    });
    t.anchor.set(0.5);
    container.addChild(t);
  }

  // 実測 bbox（container のローカル座標系＝world 単位。Text の fontSize が
  // そのまま world m として解釈される座標系のため換算は不要）を hitTest 用にキャッシュする。
  const bounds = container.getLocalBounds();
  const halfW = Math.max(bounds.width / 2, fontSize * 0.2);
  const halfH = Math.max(bounds.height / 2, fontSize * 0.4);
  setTextBounds(obj.id, { halfW, halfH });

  // 実測 bbox の中心を container の原点（=pt）に一致させる（複数文字の縦書きは
  // anchor だけでは中央揃えできないため pivot で補正する）。
  container.pivot.set(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  container.position.set(obj.pt.x, obj.pt.y);
  return container;
}
