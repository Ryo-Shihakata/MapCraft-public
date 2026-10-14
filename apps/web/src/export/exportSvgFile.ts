// SVG エクスポートのダウンロード用ラッパー（実装書 §M9-1/3）。
// svgWriter.exportSvg（純関数）を呼び、結果をファイルとしてダウンロードさせる。
import type { BBox } from "@mapcraft/shared";
import { CATALOG_BY_ID } from "@mapcraft/shared";
import type { MapDoc } from "../editor/doc/MapDoc.js";
import { buildExportFilename, downloadTextFile } from "./filename.js";
import { exportSvg } from "./svgWriter.js";

export function exportSvgFile(mapDoc: MapDoc, mapName: string, bbox: BBox, scale: number): void {
  const svg = exportSvg(mapDoc.getAllObjects(), mapDoc.getLayers(), CATALOG_BY_ID, {
    bbox,
    pxPerMeter: scale,
    scale,
  });
  downloadTextFile(svg, buildExportFilename(mapName, "svg"), "image/svg+xml");
}
