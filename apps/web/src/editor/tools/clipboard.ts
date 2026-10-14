// クリップボード（実装書 §M5-4）。モジュール内変数に MapObject[] の deep copy を保持する
// （マップを跨ぐペーストは対象外＝v2.0。実装書 M5-4 注記）。Ctrl+C/X/V・Ctrl+D。
// ペースト/複製は gridInterval 1つ分オフセット＋新 UUID 採番。
import type { MapObject, Point } from "@mapcraft/shared";
import type { MapDoc } from "../doc/MapDoc.js";

let clip: MapObject[] = [];

function offsetObject(obj: MapObject, newId: string, offset: number): MapObject {
  const shift = (p: Point): Point => ({ x: p.x + offset, y: p.y + offset });
  const out: MapObject = { ...obj, id: newId, createdAt: Date.now() };
  if (obj.pts) out.pts = obj.pts.map(shift);
  if (obj.pt) out.pt = shift(obj.pt);
  return out;
}

export const clipboard = {
  hasClip(): boolean {
    return clip.length > 0;
  },

  copy(objects: MapObject[]): void {
    clip = objects.map((o) => structuredClone(o));
  },

  cut(mapDoc: MapDoc, objects: MapObject[]): void {
    clipboard.copy(objects);
    mapDoc.deleteObjects(objects.map((o) => o.id));
    mapDoc.undo.stopCapturing();
  },

  // gridOffset: 呼び出し側（ToolManager）が gridInterval(vt.s) を渡す（tools/ は
  // ビュー状態に非依存に保つため、offset は数値として受け取るのみ）。
  paste(mapDoc: MapDoc, gridOffset: number): string[] {
    if (clip.length === 0) return [];
    const newObjects = clip.map((o) => offsetObject(o, crypto.randomUUID(), gridOffset));
    mapDoc.transact(() => {
      for (const obj of newObjects) mapDoc.upsertObject(obj);
    });
    mapDoc.undo.stopCapturing();
    // 連続 Ctrl+V でさらにオフセットが積み重なるよう、クリップボード内容を貼り付け結果で更新する。
    clip = newObjects.map((o) => structuredClone(o));
    return newObjects.map((o) => o.id);
  },

  duplicate(mapDoc: MapDoc, objects: MapObject[], gridOffset: number): string[] {
    clipboard.copy(objects);
    return clipboard.paste(mapDoc, gridOffset);
  },
};
