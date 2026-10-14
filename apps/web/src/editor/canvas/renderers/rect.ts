// rect ジオメトリのレンダラ（実装書 §3.3）。pts は対角2点。
import { Container, Graphics } from "pixi.js";
import type { MapObject, StyleDef } from "@mapcraft/shared";

export function renderRect(obj: MapObject, style: StyleDef): Container {
  const container = new Container();
  const pts = obj.pts;
  if (!pts || pts.length < 2) return container;
  const [a, b] = pts;
  if (!a || !b) return container;

  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);

  const g = new Graphics();
  g.rect(x, y, w, h);
  if (style.fill) g.fill({ color: style.fill });
  if (style.sw) g.stroke({ width: style.sw, color: style.stroke ?? "#000000" });
  container.addChild(g);
  return container;
}
