// 描画ツールの状態遷移（実装書 §M4-3）。uiStore.drawing の頂点追加/取消/確定と、
// 確定時の MapObject 組み立てを担う。ポインタ/キーイベントの実受信は ToolManager が行い、
// ここは Pixi・DOM 非依存の純粋なロジックのみを持つ。
import type { CatalogItem, Layer, MapObject, Point } from "@mapcraft/shared";
import { defaultLayerFor } from "@mapcraft/shared";
import type { MapDoc } from "../doc/MapDoc.js";
import { useUIStore } from "../state/uiStore.js";

function findLayer(mapDoc: MapDoc, layerId: string): Layer | undefined {
  return mapDoc.getLayers().find((l) => l.id === layerId);
}

// レイヤーがロック中なら確定を拒否し、理由を StatusBar 用に通知する。
// 拒否した場合 true（=ロック中）を返す。
function rejectIfLocked(mapDoc: MapDoc, layerId: string): boolean {
  const layer = findLayer(mapDoc, layerId);
  if (!layer?.locked) return false;
  useUIStore.getState().setStatusMessage(`レイヤー「${layer.name}」はロックされているため描画を確定できません`);
  return true;
}

// Y.UndoManager はデフォルトで captureTimeout（500ms）内の同一 origin トランザクションを
// 1つの undo スタック項目にマージする。これにより連続クリックが速いと複数の描画確定が
// 1回の Undo で一括に戻ってしまい「1確定=1 undo単位」の要件（実装書 M4-5）を満たせない。
// 各確定の直後に stopCapturing() を呼び、次の確定が今回のスタック項目へ絶対に
// マージされないよう境界を強制する。
function commitObject(mapDoc: MapDoc, obj: MapObject): boolean {
  if (rejectIfLocked(mapDoc, obj.layerId)) return false;
  mapDoc.upsertObject(obj);
  mapDoc.undo.stopCapturing();
  return true;
}

function buildObject(
  item: CatalogItem,
  pts: Point[] | undefined,
  pt: Point | undefined,
  mode: "straight" | "curve" | undefined
): MapObject {
  const obj: MapObject = {
    id: crypto.randomUUID(),
    geom: item.geom,
    itemId: item.id,
    layerId: defaultLayerFor(item),
    createdAt: Date.now(),
  };
  if (pts) obj.pts = pts;
  if (pt) obj.pt = pt;
  if (mode) obj.mode = mode;
  if (item.geom === "admin") {
    obj.name = "新しい領域";
    obj.showLabel = true;
  }
  return obj;
}

export const drawTool = {
  // point: クリック即確定（連続配置。呼び出し側は drawing 状態を使わない）。
  placePoint(item: CatalogItem, pt: Point, mapDoc: MapDoc): boolean {
    const obj = buildObject(item, undefined, pt, undefined);
    return commitObject(mapDoc, obj);
  },

  // rect: pointerdown→drag→up の対角2点で確定。
  commitRect(item: CatalogItem, a: Point, b: Point, mapDoc: MapDoc): boolean {
    const obj = buildObject(item, [a, b], undefined, undefined);
    return commitObject(mapDoc, obj);
  },

  // line/area/admin: クリックで頂点追加。
  addVertex(pt: Point): void {
    const { drawing } = useUIStore.getState();
    const mode = drawing?.mode ?? "straight";
    const pts = drawing ? [...drawing.pts, pt] : [pt];
    useUIStore.getState().setDrawing({ pts, mode });
  },

  // Backspace: 直前頂点を取り消す。頂点が無くなったら drawing を破棄する。
  removeLastVertex(): void {
    const { drawing } = useUIStore.getState();
    if (!drawing || drawing.pts.length === 0) return;
    const pts = drawing.pts.slice(0, -1);
    useUIStore.getState().setDrawing(pts.length > 0 ? { ...drawing, pts } : null);
  },

  // Tab: straight/curve 切替（描画中も可）。
  toggleMode(): void {
    const { drawing } = useUIStore.getState();
    if (!drawing) return;
    useUIStore.getState().setDrawing({ ...drawing, mode: drawing.mode === "curve" ? "straight" : "curve" });
  },

  // Esc: 破棄。
  cancel(): void {
    useUIStore.getState().setDrawing(null);
  },

  // Enter/ダブルクリック: line は2点以上、area/admin は3点以上で確定。
  // 確定に成功したら drawing をクリアして true を返す（頂点不足・ロック中は false）。
  commit(item: CatalogItem, mapDoc: MapDoc): boolean {
    const { drawing } = useUIStore.getState();
    if (!drawing) return false;
    const minPts = item.geom === "line" ? 2 : 3;
    if (drawing.pts.length < minPts) return false;

    const obj = buildObject(item, drawing.pts, undefined, drawing.mode);
    if (!commitObject(mapDoc, obj)) return false;

    useUIStore.getState().setDrawing(null);
    return true;
  },
};
