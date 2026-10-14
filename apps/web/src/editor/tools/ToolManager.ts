// pointerdown/move/up/キーを現在ツールへディスパッチする（実装書 §M4-1・§M5-2/3）。
// PixiCanvas から生成・破棄される。Space 一時パン・パンツール・カーソル座標追跡・
// Undo/Redo・Ctrl+0（全体表示リセット）・ツール切替（V/P/T/H）・クリップボード
// （Ctrl+C/X/V/D）もここで一元的に扱う（ツール横断の共通処理）。
// 描画プレビュー・スナップインジケータ・選択オーバーレイの実描画は PixiApp
// （canvas/preview.ts・canvas/overlay.ts 経由）へコールバックで委譲する
// （tools/ は pixi.js に依存しない）。
import type { CatalogItem, MapObject, Point } from "@mapcraft/shared";
import { CATALOG_BY_ID, distance, gridInterval, screenToWorld } from "@mapcraft/shared";
import type { MapDoc } from "../doc/MapDoc.js";
import { useUIStore } from "../state/uiStore.js";
import { useViewStore } from "../state/viewStore.js";
import { clipboard } from "./clipboard.js";
import { drawTool } from "./drawTool.js";
import { hitTest } from "./hitTest.js";
import {
  deleteObjects,
  nearestGrabVertex,
  rubberBandSelect,
  toggleSelection,
  translateObjects,
  type SelectionOverlayState,
} from "./selectTool.js";
import { resolveSnap, type SnapResult } from "./snap.js";
import {
  deleteVertex,
  findHandleIndex,
  findInsertion,
  insertVertex,
  insertionTolerance,
  isVertexEditable,
  moveVertex,
} from "./vertexEdit.js";
import { isTypingTarget, TOOL_KEYS } from "../ui/shortcuts.js";

const IDLE_SNAP: SnapResult = { pt: { x: 0, y: 0 }, kind: null };
const IDLE_SELECTION: SelectionOverlayState = {
  selected: [],
  vertexEditTarget: null,
  selectedVertexIndex: null,
  rubberBand: null,
};

export interface ToolManagerCallbacks {
  onDrawPreview: (
    drawing: { pts: Point[]; mode: "straight" | "curve" } | null,
    item: CatalogItem | undefined,
    cursor: Point
  ) => void;
  onSnapIndicator: (snap: SnapResult) => void;
  onSelectionOverlay: (state: SelectionOverlayState) => void;
}

function arrowDelta(key: string, step: number): { dx: number; dy: number } {
  switch (key) {
    case "ArrowLeft":
      return { dx: -step, dy: 0 };
    case "ArrowRight":
      return { dx: step, dy: 0 };
    case "ArrowUp":
      return { dx: 0, dy: -step };
    case "ArrowDown":
      return { dx: 0, dy: step };
    default:
      return { dx: 0, dy: 0 };
  }
}

export class ToolManager {
  private readonly container: HTMLElement;
  private readonly mapDoc: MapDoc;
  private readonly callbacks: ToolManagerCallbacks;

  private spaceHeld = false;
  private panning = false;
  private rectDragging = false;
  private rectStart: Point | null = null;
  private lastScreen = { x: 0, y: 0 };
  private lastWorld: Point = { x: 0, y: 0 };

  // M5: 選択ツールのドラッグ状態（rubber band / move / vertex edit）。
  private rubberDragging = false;
  private rubberStart: Point | null = null;

  private moveDragging = false;
  private moveOrigin: MapObject[] | null = null; // ドラッグ開始時点のオブジェクト複製（絶対位置計算の基準）
  private moveAnchor: Point | null = null; // スナップ計算の基準頂点（掴んだ点に最も近い頂点）
  private moveGrabWorld: Point | null = null; // ドラッグ開始時のカーソル world 座標
  private moveDidChange = false;

  private vertexDragging = false;
  private vertexDragObjId: string | null = null;
  private vertexDragIndex: number | null = null;
  private vertexDidChange = false;

  private readonly offListeners: Array<() => void> = [];

  constructor(container: HTMLElement, mapDoc: MapDoc, callbacks: ToolManagerCallbacks) {
    this.container = container;
    this.mapDoc = mapDoc;
    this.callbacks = callbacks;
    this.attach();

    this.offListeners.push(
      useUIStore.subscribe((state, prev) => {
        if (
          state.tool !== prev.tool ||
          state.selectedIds !== prev.selectedIds ||
          state.editingVertex !== prev.editingVertex
        ) {
          this.updateSelectionOverlay();
        }
      })
    );
    this.offListeners.push(this.mapDoc.observeObjects(() => this.updateSelectionOverlay()));
    this.updateSelectionOverlay();
  }

  destroy(): void {
    for (const off of this.offListeners) off();
    this.offListeners.length = 0;
  }

  private on(target: EventTarget, type: string, handler: EventListenerOrEventListenerObject): void {
    target.addEventListener(type, handler);
    this.offListeners.push(() => target.removeEventListener(type, handler));
  }

  private attach(): void {
    this.on(window, "keydown", this.onKeyDown as EventListener);
    this.on(window, "keyup", this.onKeyUp as EventListener);
    this.on(this.container, "pointerdown", this.onPointerDown as EventListener);
    this.on(this.container, "pointermove", this.onPointerMove as EventListener);
    this.on(this.container, "pointerup", this.onPointerUp as EventListener);
    this.on(this.container, "pointerleave", this.onPointerLeave as EventListener);
    this.on(this.container, "dblclick", this.onDblClick as EventListener);
  }

  private currentItem(): CatalogItem | undefined {
    const { activeItemId } = useUIStore.getState();
    return activeItemId ? CATALOG_BY_ID[activeItemId] : undefined;
  }

  private toWorld(clientX: number, clientY: number): Point {
    const rect = this.container.getBoundingClientRect();
    return screenToWorld(clientX - rect.left, clientY - rect.top, useViewStore.getState().vt);
  }

  private toScreen(clientX: number, clientY: number): Point {
    const rect = this.container.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  // M7-5: role=view のとき編集系操作をブロックする機構（仕上げは M8）。
  // サーバー側（MapRoom）も view からの sync-update を破棄するが、ここでは
  // 無駄な update 生成とローカル UI の混乱（サーバーに拒否されて見た目が戻る）を避ける。
  private isReadonly(): boolean {
    return useUIStore.getState().role === "view";
  }

  private objectsFor(ids: string[]): MapObject[] {
    const out: MapObject[] = [];
    for (const id of ids) {
      const obj = this.mapDoc.getObject(id);
      if (obj) out.push(obj);
    }
    return out;
  }

  private computeSnap(world: Point): SnapResult {
    const { tool, drawing, snapConfig } = useUIStore.getState();
    const item = this.currentItem();
    if (tool !== "draw" || !item) return { pt: world, kind: null };
    const prevPoint = drawing && drawing.pts.length > 0 ? drawing.pts[drawing.pts.length - 1]! : null;
    return resolveSnap(world, {
      vt: useViewStore.getState().vt,
      objects: this.mapDoc.getAllObjects(),
      snapConfig,
      prevPoint,
    });
  }

  // 頂点編集・移動ドラッグ用のスナップ解決。対象オブジェクト自身の頂点は候補から除外する
  // （実装書 §M5-3: 自オブジェクトの頂点は除外）。角度スナップは基準方向を持たないため不適用。
  private resolveEditSnap(world: Point, excludeIds: Set<string>): SnapResult {
    const { snapConfig } = useUIStore.getState();
    const objects = this.mapDoc.getAllObjects().filter((o) => !excludeIds.has(o.id));
    return resolveSnap(world, {
      vt: useViewStore.getState().vt,
      objects,
      snapConfig,
      prevPoint: null,
    });
  }

  // 直近のカーソル位置を使ってプレビュー・スナップインジケータを再計算する
  // （Tab/Backspace/Esc など、マウスを動かさないキー操作の直後に呼ぶ）。
  private refreshPreview(): void {
    this.applyPreview(this.computeSnap(this.lastWorld));
  }

  private applyPreview(snap: SnapResult): void {
    const { tool, drawing } = useUIStore.getState();
    const item = this.currentItem();
    if (tool !== "draw" || !item) {
      this.callbacks.onSnapIndicator(IDLE_SNAP);
      this.callbacks.onDrawPreview(null, undefined, snap.pt);
      return;
    }
    this.callbacks.onSnapIndicator(snap);
    this.callbacks.onDrawPreview(drawing, item, snap.pt);
  }

  private commit(item: CatalogItem): void {
    if (drawTool.commit(item, this.mapDoc)) this.refreshPreview();
  }

  // カーソルが canvas 外に出た時など、プレビュー・スナップインジケータを完全に隠す。
  private hidePreview(): void {
    this.callbacks.onSnapIndicator(IDLE_SNAP);
    this.callbacks.onDrawPreview(null, undefined, { x: 0, y: 0 });
  }

  // ─── M5: 選択オーバーレイ ────────────────────────────────────────────────

  private updateSelectionOverlay(): void {
    const { tool, selectedIds, editingVertex } = useUIStore.getState();
    if (tool !== "select") {
      this.callbacks.onSelectionOverlay(IDLE_SELECTION);
      return;
    }
    const selected = this.objectsFor(selectedIds);
    const vertexEditTarget = selected.length === 1 && isVertexEditable(selected[0]!) ? selected[0]! : null;
    const selectedVertexIndex =
      editingVertex && vertexEditTarget && editingVertex.objectId === vertexEditTarget.id ? editingVertex.index : null;
    const rubberBand = this.rubberDragging && this.rubberStart ? { a: this.rubberStart, b: this.lastWorld } : null;
    this.callbacks.onSelectionOverlay({ selected, vertexEditTarget, selectedVertexIndex, rubberBand });
  }

  private endRubberDrag(): void {
    this.rubberDragging = false;
    this.rubberStart = null;
    this.updateSelectionOverlay();
  }

  private endMoveDrag(): void {
    this.moveDragging = false;
    this.moveOrigin = null;
    this.moveAnchor = null;
    this.moveGrabWorld = null;
    this.moveDidChange = false;
    this.updateSelectionOverlay();
  }

  private endVertexDrag(): void {
    this.vertexDragging = false;
    this.vertexDragObjId = null;
    this.vertexDragIndex = null;
    this.vertexDidChange = false;
    this.updateSelectionOverlay();
  }

  private onSelectPointerDown = (e: PointerEvent): void => {
    const vt = useViewStore.getState().vt;
    const world = this.toWorld(e.clientX, e.clientY);
    const screen = this.toScreen(e.clientX, e.clientY);
    const { selectedIds } = useUIStore.getState();
    const selectedObjects = this.objectsFor(selectedIds);
    const vertexTarget =
      selectedObjects.length === 1 && isVertexEditable(selectedObjects[0]!) ? selectedObjects[0]! : null;

    if (vertexTarget && !this.isReadonly()) {
      if (e.altKey) {
        const insertion = findInsertion(world, vertexTarget, insertionTolerance(vt));
        if (insertion) {
          insertVertex(this.mapDoc, vertexTarget, insertion.index, insertion.pt);
          this.updateSelectionOverlay();
          return;
        }
      }
      const handleIndex = findHandleIndex(screen, vertexTarget, vt);
      if (handleIndex !== null) {
        useUIStore.getState().setEditingVertex({ objectId: vertexTarget.id, index: handleIndex });
        this.vertexDragging = true;
        this.vertexDragObjId = vertexTarget.id;
        this.vertexDragIndex = handleIndex;
        this.vertexDidChange = false;
        this.container.setPointerCapture(e.pointerId);
        this.updateSelectionOverlay();
        return;
      }
    }

    const hit = hitTest(world, vt, this.mapDoc.getAllObjects(), this.mapDoc.getLayers());

    if (hit) {
      if (e.shiftKey) {
        useUIStore.getState().setSelectedIds(toggleSelection(selectedIds, hit.id));
        useUIStore.getState().setEditingVertex(null);
        this.updateSelectionOverlay();
        return;
      }

      let currentIds = selectedIds;
      if (!selectedIds.includes(hit.id)) {
        currentIds = [hit.id];
        useUIStore.getState().setSelectedIds(currentIds);
        useUIStore.getState().setEditingVertex(null);
      }

      if (!this.isReadonly()) {
        const moveObjs = this.objectsFor(currentIds);
        this.moveDragging = true;
        this.moveOrigin = moveObjs.map((o) => structuredClone(o));
        this.moveAnchor = nearestGrabVertex(world, this.moveOrigin) ?? world;
        this.moveGrabWorld = world;
        this.moveDidChange = false;
        this.container.setPointerCapture(e.pointerId);
      }
      this.updateSelectionOverlay();
      return;
    }

    // 空地クリック/ドラッグ開始。Shift 押下中は既存選択を保持したままラバーバンドを追加する。
    if (!e.shiftKey) {
      useUIStore.getState().setSelectedIds([]);
      useUIStore.getState().setEditingVertex(null);
    }
    this.rubberDragging = true;
    this.rubberStart = world;
    this.container.setPointerCapture(e.pointerId);
    this.updateSelectionOverlay();
  };

  private onSelectPointerMove = (world: Point): void => {
    if (this.vertexDragging && this.vertexDragObjId !== null && this.vertexDragIndex !== null) {
      const obj = this.mapDoc.getObject(this.vertexDragObjId);
      if (obj) {
        const snap = this.resolveEditSnap(world, new Set([obj.id]));
        moveVertex(this.mapDoc, obj, this.vertexDragIndex, snap.pt);
        this.vertexDidChange = true;
      }
      this.updateSelectionOverlay();
      return;
    }

    if (this.moveDragging && this.moveOrigin && this.moveAnchor && this.moveGrabWorld) {
      const rawDx = world.x - this.moveGrabWorld.x;
      const rawDy = world.y - this.moveGrabWorld.y;
      const excludeIds = new Set(this.moveOrigin.map((o) => o.id));
      const targetAnchor = { x: this.moveAnchor.x + rawDx, y: this.moveAnchor.y + rawDy };
      const snap = this.resolveEditSnap(targetAnchor, excludeIds);
      const dx = snap.pt.x - this.moveAnchor.x;
      const dy = snap.pt.y - this.moveAnchor.y;
      translateObjects(this.mapDoc, this.moveOrigin, dx, dy);
      if (dx !== 0 || dy !== 0) this.moveDidChange = true;
      this.updateSelectionOverlay();
      return;
    }

    if (this.rubberDragging) {
      this.updateSelectionOverlay();
    }
  };

  private onSelectPointerUp = (e: PointerEvent): void => {
    if (this.container.hasPointerCapture(e.pointerId)) this.container.releasePointerCapture(e.pointerId);

    if (this.vertexDragging) {
      if (this.vertexDidChange) this.mapDoc.undo.stopCapturing();
      this.endVertexDrag();
      return;
    }

    if (this.moveDragging) {
      if (this.moveDidChange) this.mapDoc.undo.stopCapturing();
      this.endMoveDrag();
      return;
    }

    if (this.rubberDragging) {
      if (this.rubberStart) {
        const vt = useViewStore.getState().vt;
        const ids = rubberBandSelect(
          this.rubberStart,
          this.lastWorld,
          vt,
          this.mapDoc.getAllObjects(),
          this.mapDoc.getLayers()
        );
        if (ids.length > 0) {
          const { selectedIds } = useUIStore.getState();
          useUIStore.getState().setSelectedIds(Array.from(new Set([...selectedIds, ...ids])));
        }
      }
      this.endRubberDrag();
    }
  };

  private onSelectKeyDown(e: KeyboardEvent): boolean {
    const { selectedIds, editingVertex } = useUIStore.getState();

    if (e.key === "Escape") {
      e.preventDefault();
      if (this.moveDragging) {
        if (this.moveDidChange) this.mapDoc.undo.undo();
        this.endMoveDrag();
        return true;
      }
      if (this.vertexDragging) {
        if (this.vertexDidChange) this.mapDoc.undo.undo();
        this.endVertexDrag();
        return true;
      }
      if (this.rubberDragging) {
        this.endRubberDrag();
        return true;
      }
      if (editingVertex) {
        useUIStore.getState().setEditingVertex(null);
        this.updateSelectionOverlay();
        return true;
      }
      if (selectedIds.length > 0) {
        useUIStore.getState().setSelectedIds([]);
        this.updateSelectionOverlay();
      }
      return true;
    }

    if (e.key === "Delete") {
      e.preventDefault();
      if (this.isReadonly()) return true;
      if (editingVertex) {
        const obj = this.mapDoc.getObject(editingVertex.objectId);
        if (obj) {
          const ok = deleteVertex(this.mapDoc, obj, editingVertex.index);
          if (ok) useUIStore.getState().setEditingVertex(null);
          else useUIStore.getState().setStatusMessage("これ以上頂点を削除できません");
        }
      } else if (selectedIds.length > 0) {
        deleteObjects(this.mapDoc, selectedIds);
        useUIStore.getState().setSelectedIds([]);
      }
      this.updateSelectionOverlay();
      return true;
    }

    if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      if (this.isReadonly() || selectedIds.length === 0) return true;
      const vt = useViewStore.getState().vt;
      const step = gridInterval(vt.s) * (e.shiftKey ? 10 : 1);
      const { dx, dy } = arrowDelta(e.key, step);
      const objects = this.objectsFor(selectedIds);
      translateObjects(this.mapDoc, objects, dx, dy);
      this.mapDoc.undo.stopCapturing();
      this.updateSelectionOverlay();
      return true;
    }

    return false;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (isTypingTarget(e.target)) return;

    if (e.code === "Space") {
      this.spaceHeld = true;
      e.preventDefault();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "0") {
      e.preventDefault();
      const rect = this.container.getBoundingClientRect();
      useViewStore.getState().reset(rect.width, rect.height, 0.1);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) this.mapDoc.undo.redo();
      else this.mapDoc.undo.undo();
      return;
    }

    // クリップボード（Ctrl+C/X/V/D）。ツール横断で常に有効。
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      const key = e.key.toLowerCase();
      if (key === "c" || key === "x" || key === "d") {
        if (this.isReadonly() && key !== "c") return;
        const { selectedIds } = useUIStore.getState();
        const objects = this.objectsFor(selectedIds);
        if (objects.length > 0) {
          e.preventDefault();
          const gridOffset = gridInterval(useViewStore.getState().vt.s);
          if (key === "c") {
            clipboard.copy(objects);
          } else if (key === "x") {
            clipboard.cut(this.mapDoc, objects);
            useUIStore.getState().setSelectedIds([]);
          } else {
            const ids = clipboard.duplicate(this.mapDoc, objects, gridOffset);
            useUIStore.getState().setSelectedIds(ids);
          }
          this.updateSelectionOverlay();
        }
        return;
      }
      if (key === "v" && clipboard.hasClip()) {
        if (this.isReadonly()) return;
        e.preventDefault();
        const gridOffset = gridInterval(useViewStore.getState().vt.s);
        const ids = clipboard.paste(this.mapDoc, gridOffset);
        useUIStore.getState().setSelectedIds(ids);
        this.updateSelectionOverlay();
        return;
      }
    }

    // ツール切替（V/P/T/H。修飾キーなし）。
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const key = e.key.toLowerCase();
      const nextTool = TOOL_KEYS[key];
      if (nextTool) {
        if (this.isReadonly() && (nextTool === "draw" || nextTool === "text")) return;
        e.preventDefault();
        useUIStore.getState().setTool(nextTool);
        return;
      }
    }

    const { tool } = useUIStore.getState();

    if (tool === "select") {
      if (this.onSelectKeyDown(e)) return;
      return;
    }

    if (tool !== "draw") return;
    const item = this.currentItem();
    if (!item || item.geom === "point" || item.geom === "rect") return;

    if (e.key === "Tab") {
      e.preventDefault();
      drawTool.toggleMode();
      this.refreshPreview();
    } else if (e.key === "Enter") {
      e.preventDefault();
      this.commit(item);
    } else if (e.key === "Escape") {
      e.preventDefault();
      drawTool.cancel();
      this.refreshPreview();
    } else if (e.key === "Backspace") {
      e.preventDefault();
      drawTool.removeLastVertex();
      this.refreshPreview();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === "Space") this.spaceHeld = false;
  };

  private onPointerDown = (e: PointerEvent): void => {
    // M6: テキスト編集セッション中はキャンバス操作（パン・選択・描画）を一時停止する。
    // 確定/破棄は TextEditOverlay 側の Enter/Esc/blur で行う。
    if (useUIStore.getState().textEdit) return;

    const { tool } = useUIStore.getState();

    if (e.button === 1 || (e.button === 0 && (this.spaceHeld || tool === "pan"))) {
      this.panning = true;
      this.lastScreen = { x: e.clientX, y: e.clientY };
      this.container.setPointerCapture(e.pointerId);
      return;
    }

    if (e.button !== 0) return;

    if (tool === "select") {
      this.onSelectPointerDown(e);
      return;
    }

    if (this.isReadonly()) return; // view ロールは draw/text 操作を不可（機構。仕上げは M8）

    if (tool === "text") {
      this.onTextPointerDown(e);
      return;
    }

    if (tool !== "draw") return;
    const item = this.currentItem();
    if (!item) return;

    const world = this.toWorld(e.clientX, e.clientY);
    const snap = this.computeSnap(world);

    if (item.geom === "point") {
      drawTool.placePoint(item, snap.pt, this.mapDoc);
      return;
    }

    if (item.geom === "rect") {
      this.rectDragging = true;
      this.rectStart = snap.pt;
      useUIStore.getState().setDrawing({ pts: [snap.pt, snap.pt], mode: "straight" });
      this.container.setPointerCapture(e.pointerId);
      this.applyPreview(snap);
      return;
    }

    // line / area / admin: クリックで頂点追加
    drawTool.addVertex(snap.pt);
    this.applyPreview(snap);
  };

  private onPointerMove = (e: PointerEvent): void => {
    const world = this.toWorld(e.clientX, e.clientY);
    this.lastWorld = world;
    useUIStore.getState().setCursorWorld(world);

    if (this.panning) {
      const dx = e.clientX - this.lastScreen.x;
      const dy = e.clientY - this.lastScreen.y;
      this.lastScreen = { x: e.clientX, y: e.clientY };
      useViewStore.getState().pan(dx, dy);
      return;
    }

    const { tool } = useUIStore.getState();
    if (tool === "select") {
      this.onSelectPointerMove(world);
      return;
    }

    const snap = this.computeSnap(world);

    if (this.rectDragging && this.rectStart) {
      let end = snap.pt;
      if (e.shiftKey) {
        const dx = end.x - this.rectStart.x;
        const dy = end.y - this.rectStart.y;
        const side = Math.max(Math.abs(dx), Math.abs(dy));
        end = {
          x: this.rectStart.x + Math.sign(dx || 1) * side,
          y: this.rectStart.y + Math.sign(dy || 1) * side,
        };
      }
      useUIStore.getState().setDrawing({ pts: [this.rectStart, end], mode: "straight" });
    }

    this.applyPreview(snap);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.panning) {
      this.panning = false;
      if (this.container.hasPointerCapture(e.pointerId)) this.container.releasePointerCapture(e.pointerId);
      return;
    }

    if (this.rubberDragging || this.moveDragging || this.vertexDragging) {
      this.onSelectPointerUp(e);
      return;
    }

    if (this.rectDragging) {
      this.rectDragging = false;
      if (this.container.hasPointerCapture(e.pointerId)) this.container.releasePointerCapture(e.pointerId);
      const item = this.currentItem();
      const { drawing } = useUIStore.getState();
      if (item && drawing && drawing.pts.length === 2) {
        const [a, b] = drawing.pts;
        if (a && b && distance(a, b) > 1e-6) drawTool.commitRect(item, a, b, this.mapDoc);
      }
      useUIStore.getState().setDrawing(null);
      this.rectStart = null;
      this.refreshPreview();
    }
  };

  private onPointerLeave = (): void => {
    if (this.panning || this.rectDragging || this.rubberDragging || this.moveDragging || this.vertexDragging) return;
    useUIStore.getState().setCursorWorld(null);
    this.hidePreview();
  };

  // M6: text ツールでのクリック。既存テキストをクリックした場合はその場で再編集を開始し、
  // それ以外（空地・他ジオメトリの上）ではクリック位置に新規テキストの入力セッションを開く
  // （実装書 §M6-1: 「キャンバスクリック→インライン入力」「既存テキストはダブルクリックで再編集」。
  // text ツール中は単発クリックで既存テキストにヒットした時点で再編集扱いにすることで、
  // ダブルクリックの1回目でも意図せず新規オブジェクトが生成されるのを防ぐ）。
  private onTextPointerDown = (e: PointerEvent): void => {
    const world = this.toWorld(e.clientX, e.clientY);
    const vt = useViewStore.getState().vt;
    const hit = hitTest(world, vt, this.mapDoc.getAllObjects(), this.mapDoc.getLayers());
    if (hit && hit.geom === "text" && hit.pt) {
      useUIStore.getState().setTextEdit({ objectId: hit.id, pt: hit.pt, text: hit.text ?? "" });
    } else {
      useUIStore.getState().setTextEdit({ objectId: null, pt: world, text: "" });
    }
  };

  private onDblClick = (e: MouseEvent): void => {
    if (useUIStore.getState().textEdit) return;

    const { tool } = useUIStore.getState();

    if (tool === "select") {
      // M6: 選択ツール中でも既存テキストのダブルクリックで再編集できる（実装書 §M6-1）。
      if (this.isReadonly()) return;
      const world = this.toWorld(e.clientX, e.clientY);
      const vt = useViewStore.getState().vt;
      const hit = hitTest(world, vt, this.mapDoc.getAllObjects(), this.mapDoc.getLayers());
      if (hit && hit.geom === "text" && hit.pt) {
        useUIStore.getState().setTextEdit({ objectId: hit.id, pt: hit.pt, text: hit.text ?? "" });
      }
      return;
    }

    if (this.isReadonly()) return;
    if (tool !== "draw") return;
    const item = this.currentItem();
    if (!item || item.geom === "point" || item.geom === "rect") return;
    this.commit(item);
  };
}
