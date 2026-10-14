// テキストツールの純粋ロジック（実装書 §M6-1）。新規テキストの確定・既存テキストの
// 再編集確定を担う。インライン入力欄の DOM 処理自体は editor/ui/TextEditOverlay.tsx
// （React）が行い、ここは MapDoc への反映のみを提供する（tools/ は pixi.js/DOM に
// 依存しない、という drawTool.ts / selectTool.ts と同じ方針を踏襲）。
import type { MapObject, Point } from "@mapcraft/shared";
import { TEXT_ITEM_ID } from "@mapcraft/shared";
import type { MapDoc } from "../doc/MapDoc.js";
import { useUIStore } from "../state/uiStore.js";

const DEFAULT_LAYER_ID = "annotation";
const DEFAULT_FONT_SIZE = 100;

function isLayerLocked(mapDoc: MapDoc, layerId: string): boolean {
  return mapDoc.getLayers().find((l) => l.id === layerId)?.locked ?? false;
}

export const textTool = {
  // 新規テキストの確定。空文字（前後空白のみ含む）は破棄する（実装書 §M6-1）。
  commitNew(mapDoc: MapDoc, pt: Point, text: string): boolean {
    if (text.trim().length === 0) return false;
    if (isLayerLocked(mapDoc, DEFAULT_LAYER_ID)) {
      useUIStore.getState().setStatusMessage("レイヤー「注記」はロックされているため配置できません");
      return false;
    }
    const obj: MapObject = {
      id: crypto.randomUUID(),
      geom: "text",
      itemId: TEXT_ITEM_ID,
      pt,
      text,
      fontSize: DEFAULT_FONT_SIZE,
      orientation: "h",
      layerId: DEFAULT_LAYER_ID,
      createdAt: Date.now(),
    };
    mapDoc.upsertObject(obj);
    mapDoc.undo.stopCapturing();
    return true;
  },

  // 既存テキストの再編集確定。空文字は「破棄」（=変更を反映せず元のまま）とする
  // （誤って全消しして Enter した場合にオブジェクトが消えてしまう事故を避けるため）。
  commitEdit(mapDoc: MapDoc, objectId: string, text: string): boolean {
    if (text.trim().length === 0) return false;
    const obj = mapDoc.getObject(objectId);
    if (!obj) return false;
    if (isLayerLocked(mapDoc, obj.layerId)) {
      useUIStore.getState().setStatusMessage("このテキストのレイヤーはロックされているため編集できません");
      return false;
    }
    mapDoc.updateObject(objectId, { text });
    mapDoc.undo.stopCapturing();
    return true;
  },
};
