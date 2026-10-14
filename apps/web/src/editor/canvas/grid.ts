// スクリーン空間グリッド（実装書 §3.6）。メジャー/マイナー2階調。ビュー変更ごとに再描画。
import { Container, Graphics } from "pixi.js";
import type { ViewTransform } from "@mapcraft/shared";
import { gridInterval } from "@mapcraft/shared";

export function renderGrid(container: Container, vt: ViewTransform, width: number, height: number): void {
  for (const c of container.removeChildren()) c.destroy();
  if (width <= 0 || height <= 0 || vt.s <= 0) return;

  const interval = gridInterval(vt.s);
  const majorInterval = interval * 5;

  const x0 = -vt.x / vt.s;
  const y0 = -vt.y / vt.s;
  const x1 = (width - vt.x) / vt.s;
  const y1 = (height - vt.y) / vt.s;

  const startX = Math.floor(x0 / interval) * interval;
  const startY = Math.floor(y0 / interval) * interval;

  const g = new Graphics();

  for (let wx = startX; wx <= x1 + interval; wx += interval) {
    const sx = wx * vt.s + vt.x;
    const isMajor = Math.abs(wx % majorInterval) < 1e-6;
    g.moveTo(sx, 0)
      .lineTo(sx, height)
      .stroke({ width: 1, color: 0x645646, alpha: isMajor ? 0.22 : 0.12 });
  }
  for (let wy = startY; wy <= y1 + interval; wy += interval) {
    const sy = wy * vt.s + vt.y;
    const isMajor = Math.abs(wy % majorInterval) < 1e-6;
    g.moveTo(0, sy)
      .lineTo(width, sy)
      .stroke({ width: 1, color: 0x645646, alpha: isMajor ? 0.22 : 0.12 });
  }

  container.addChild(g);
}
