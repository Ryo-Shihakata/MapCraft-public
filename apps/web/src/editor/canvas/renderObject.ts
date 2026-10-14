// 「1オブジェクト → Container」の純粋な変換（実装書 §M3-3）。
// 差分再描画（MapDoc.observeObjects の changedIds のみ再構築）は PixiApp 側の責務。
import { Container } from "pixi.js";
import type { CatalogItem, MapObject } from "@mapcraft/shared";
import { effectiveStyle } from "@mapcraft/shared";
import type { PatternRegistry } from "./PatternRegistry.js";
import { renderArea } from "./renderers/area.js";
import { renderLine } from "./renderers/line.js";
import { renderRect } from "./renderers/rect.js";
import { renderSymbol } from "./renderers/symbol.js";
import { renderText } from "./renderers/text.js";

export function renderObject(
  obj: MapObject,
  catalogById: Record<string, CatalogItem>,
  vtS: number,
  patternRegistry: PatternRegistry
): Container {
  const style = effectiveStyle(obj, catalogById);
  switch (obj.geom) {
    case "line":
      return renderLine(obj, style, vtS);
    case "area":
    case "admin":
      return renderArea(obj, style, vtS, patternRegistry);
    case "rect":
      return renderRect(obj, style);
    case "point":
      return renderSymbol(obj, style, vtS);
    case "text":
      return renderText(obj, style);
    default:
      return new Container();
  }
}
