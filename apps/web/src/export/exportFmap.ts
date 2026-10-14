// .fmap エクスポート（実装書 §M9-4）。Y.Doc スナップショット（MapDoc）から
// serializeFmap でシリアライズし、ダウンロードさせる。
import { serializeFmap } from "@mapcraft/shared";
import type { MapDoc } from "../editor/doc/MapDoc.js";
import { buildExportFilename, downloadTextFile } from "./filename.js";

export function exportFmap(mapDoc: MapDoc, mapName: string): void {
  const layers = mapDoc.getLayers();
  const json = serializeFmap({
    name: mapName,
    layers,
    layerOrder: layers.map((l) => l.id),
    objects: mapDoc.getAllObjects(),
  });
  downloadTextFile(json, buildExportFilename(mapName, "fmap"), "application/json");
}
