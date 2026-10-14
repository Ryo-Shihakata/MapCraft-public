// Pixi v8 レンダラパイプライン本体（実装書 §3.1・§3.3）。
// Container 構成:
//   worldRoot（vt を position/scale に反映）
//     ├── objectLayer（sortableChildren=true, zIndex=style.z, id→Container）
//     └── previewLayer（描画中プレビュー。M4 で使用）
//   gridLayer（screen 空間）
//   overlayLayer（screen 空間。選択枠・頂点ハンドル・リモートカーソル。M4/M5 で使用）
//
// 差分再描画: MapDoc.observeObjects の changedIds のみ Container を破棄→再構築する。
// 全再描画 API は存在しない。ただし線幅クランプ（0.75/vt.s）とパターンの
// tileScale（1/vt.s）は vt.s に依存するため、vt.s が変化した時だけ対象オブジェクト
// （line 全般、pattern を持つ area/admin）を再構築し、point はスケール値のみ更新する。
import { Application, Container, RenderTexture, TilingSprite } from "pixi.js";
import type { BBox, CatalogItem, Layer, MapObject, Point, ViewTransform } from "@mapcraft/shared";
import { bbox } from "@mapcraft/shared";
import type { MapDoc } from "../doc/MapDoc.js";
import type { SnapResult } from "../tools/snap.js";
import { PatternRegistry } from "./PatternRegistry.js";
import { renderGrid } from "./grid.js";
import { renderOverlay, renderRemoteAwarenessOverlay, renderSelectionOverlay } from "./overlay.js";
import type { RemoteAwarenessEntry } from "../doc/awareness.js";
import { renderObject } from "./renderObject.js";
import { renderDrawPreview, renderSnapIndicator } from "./preview.js";
import { symbolScale } from "./renderers/symbol.js";
import { effectiveLineWidth } from "./renderers/line.js";
import { effectiveStyle } from "@mapcraft/shared";
import type { SelectionOverlayState } from "../tools/selectTool.js";
import { deleteTextBounds, getTextBounds } from "../tools/textBoundsCache.js";

const IDLE_SNAP: SnapResult = { pt: { x: 0, y: 0 }, kind: null };
const IDLE_SELECTION: SelectionOverlayState = {
  selected: [],
  vertexEditTarget: null,
  selectedVertexIndex: null,
  rubberBand: null,
};

// text は実測 bbox（textBoundsCache。renderObject 内で更新済み）を使う（実装書 §M6-2）。
// カリング用途なので、未計測（キャッシュ未設定）ならアンカー点のみの bbox にフォールバックする。
function objectWorldBBox(obj: MapObject): BBox {
  if (obj.geom === "text" && obj.pt) {
    const cached = getTextBounds(obj.id);
    if (cached) {
      return {
        minX: obj.pt.x - cached.halfW,
        minY: obj.pt.y - cached.halfH,
        maxX: obj.pt.x + cached.halfW,
        maxY: obj.pt.y + cached.halfH,
      };
    }
  }
  if (obj.pts && obj.pts.length > 0) return bbox(obj.pts);
  if (obj.pt) return bbox([obj.pt]);
  return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

function intersects(a: BBox, b: BBox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

// M9: エクスポート範囲計算用（全オブジェクト+余白5%）。
function unionBBox(a: BBox, b: BBox): BBox {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function viewportWorldBBox(vt: ViewTransform, width: number, height: number, marginPx: number): BBox {
  const margin = marginPx / vt.s;
  return {
    minX: -vt.x / vt.s - margin,
    minY: -vt.y / vt.s - margin,
    maxX: (width - vt.x) / vt.s + margin,
    maxY: (height - vt.y) / vt.s + margin,
  };
}

function isLayerHidden(obj: MapObject, layerMap: Map<string, Layer>, vtS: number): boolean {
  if (obj.visible === false) return true;
  const layer = layerMap.get(obj.layerId);
  if (!layer) return false;
  if (!layer.visible) return true;
  if (vtS < layer.minS || vtS > layer.maxS) return true;
  return false;
}

export class PixiApp {
  readonly app: Application;
  private readonly worldRoot: Container;
  private readonly objectLayer: Container;
  private readonly previewLayer: Container;
  private readonly gridLayer: Container;
  private readonly overlayLayer: Container;
  private readonly patternRegistry: PatternRegistry;

  private readonly mapDoc: MapDoc;
  private readonly catalogById: Record<string, CatalogItem>;
  private readonly getVt: () => ViewTransform;

  private readonly objectsCache = new Map<string, MapObject>();
  private readonly containers = new Map<string, Container>();
  private readonly bboxCache = new Map<string, BBox>();
  private layerMap = new Map<string, Layer>();

  // M10-2 性能対策: ズーム毎tickの全再構築を避けるためのキャッシュ。
  // patternSprites はタイルスケールをその場更新するための参照、lineEffWidth は
  // 「クランプ後の実効線幅が実際に変わった line だけ」を再構築するための前回値。
  private readonly patternSprites = new Map<string, TilingSprite[]>();
  private readonly lineEffWidth = new Map<string, number>();
  private lineClampTimer: number | null = null;

  private readonly unsubscribers: Array<() => void> = [];
  private destroyed = false;

  // M4: 描画プレビュー・スナップインジケータ。ToolManager からのコールバックで
  // 更新される。vt.s の変化時（線幅クランプ・スクリーン固定半径の再計算のため）に
  // 再描画できるよう最後の状態を保持しておく。
  private lastPreview: {
    drawing: { pts: Point[]; mode: "straight" | "curve" } | null;
    item: CatalogItem | undefined;
    cursor: Point;
  } | null = null;
  private lastSnap: SnapResult = IDLE_SNAP;

  // M5: 選択枠・頂点ハンドル・ラバーバンド。ToolManager からのコールバックで更新される。
  private lastSelection: SelectionOverlayState = IDLE_SELECTION;

  // M7: リモートカーソル・リモート選択（awareness）。cursorPositions は 200ms 補間の
  // 「表示用」現在位置（remoteAwareness の cursor が補間先の target）。
  private remoteAwareness: RemoteAwarenessEntry[] = [];
  private readonly cursorPositions = new Map<number, Point>();

  private constructor(
    app: Application,
    mapDoc: MapDoc,
    catalogById: Record<string, CatalogItem>,
    getVt: () => ViewTransform
  ) {
    this.app = app;
    this.mapDoc = mapDoc;
    this.catalogById = catalogById;
    this.getVt = getVt;

    this.gridLayer = new Container();
    this.worldRoot = new Container();
    this.objectLayer = new Container({ sortableChildren: true });
    this.previewLayer = new Container();
    this.overlayLayer = new Container();

    this.worldRoot.addChild(this.objectLayer, this.previewLayer);
    this.app.stage.addChild(this.gridLayer, this.worldRoot, this.overlayLayer);

    this.patternRegistry = new PatternRegistry(this.app);
  }

  static async create(
    container: HTMLElement,
    mapDoc: MapDoc,
    catalogById: Record<string, CatalogItem>,
    getVt: () => ViewTransform,
    subscribeVt: (cb: (vt: ViewTransform, prevVt: ViewTransform) => void) => () => void
  ): Promise<PixiApp> {
    const app = new Application();
    await app.init({
      resizeTo: container,
      backgroundColor: 0xf7f5f0,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });

    // Pixi にキャンバスを生成させ、コンテナへ追加する（React 側の <canvas> を
    // 使い回さない）。StrictMode の mount→unmount→mount で同一 canvas を再利用すると
    // 2度目の Application が失われた WebGL context を掴んでクラッシュするため
    // （過去の v1 での実障害。git 5a2ea06 参照）、毎回フレッシュな canvas を使う。
    const canvas = app.canvas as HTMLCanvasElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    container.appendChild(canvas);

    const instance = new PixiApp(app, mapDoc, catalogById, getVt);
    // M10-2 性能計測用: 初期表示（全オブジェクトの初回構築）にかかった時間をログに残す
    // （DoD①「初期表示 < 3s」の裏付け。本番ビルドでは tree-shake で消える）。
    const buildStart = import.meta.env.DEV ? performance.now() : 0;
    instance.buildAll();
    if (import.meta.env.DEV) {
      const elapsed = performance.now() - buildStart;
      console.debug(`[PixiApp] initial buildAll (${mapDoc.getAllObjects().length} objects) in ${elapsed.toFixed(2)}ms`);
    }
    instance.renderGridLayer();
    instance.renderOverlayLayer();
    instance.renderPreviewLayer();
    instance.applyTransform();

    instance.unsubscribers.push(
      mapDoc.observeObjects((changedIds) => {
        // M10-2 性能計測用: 1変更あたりの再描画時間を計測してログに残す（DoD③「1オブジェクト
        // 編集の再描画 < 5ms」の裏付け）。本番ビルドでは import.meta.env.DEV が false になり
        // tree-shake で消えるため、計測コストは開発時のみ。
        const start = import.meta.env.DEV ? performance.now() : 0;
        for (const id of changedIds) instance.rebuildObject(id);
        if (import.meta.env.DEV) {
          const elapsed = performance.now() - start;
          console.debug(`[PixiApp] rebuild ${changedIds.size} object(s) in ${elapsed.toFixed(2)}ms`);
        }
      })
    );
    instance.unsubscribers.push(
      mapDoc.observeLayers(() => {
        instance.layerMap = new Map(mapDoc.getLayers().map((l) => [l.id, l]));
        instance.applyVisibilityAll();
      })
    );
    instance.unsubscribers.push(
      subscribeVt((vt, prevVt) => {
        instance.applyTransform();
        instance.renderGridLayer();
        instance.renderOverlayLayer();
        if (vt.s !== prevVt.s) {
          instance.onScaleChange();
          // previewLayer はスクリーン固定半径・線幅クランプ（/vt.s）を持つため
          // スケール変化時のみ再描画が必要（位置変化は worldRoot の transform で自動追従）。
          instance.renderPreviewLayer();
        }
        instance.applyVisibilityAll();
      })
    );
    const onResize = () => {
      instance.renderGridLayer();
      instance.applyVisibilityAll();
    };
    app.renderer.on("resize", onResize);
    instance.unsubscribers.push(() => app.renderer.off("resize", onResize));

    // M7: リモートカーソルの 200ms 補間（実装書 §M7-4）。remoteAwareness が空の間は
    // 何もしない（overlay 再描画コストを避ける）。
    const onTick = (ticker: { deltaMS: number }) => instance.tickRemoteCursors(ticker.deltaMS);
    app.ticker.add(onTick);
    instance.unsubscribers.push(() => app.ticker.remove(onTick));

    return instance;
  }

  private buildAll(): void {
    this.layerMap = new Map(this.mapDoc.getLayers().map((l) => [l.id, l]));
    for (const obj of this.mapDoc.getAllObjects()) this.rebuildObject(obj.id);
  }

  // MapDoc.observeObjects の changedIds 単位で呼ばれる。追加/更新/削除いずれも
  // 「対象 id の Container を作り直す」で表現できる（未存在なら削除として扱う）。
  private rebuildObject(id: string): void {
    const obj = this.mapDoc.getObject(id);

    const old = this.containers.get(id);
    if (old) {
      this.objectLayer.removeChild(old);
      old.destroy({ children: true });
      this.containers.delete(id);
    }

    if (!obj) {
      const prevObj = this.objectsCache.get(id);
      this.objectsCache.delete(id);
      this.bboxCache.delete(id);
      this.patternSprites.delete(id);
      this.lineEffWidth.delete(id);
      if (prevObj?.geom === "text") deleteTextBounds(id);
      if (import.meta.env.DEV) console.debug(`[PixiApp] object removed: ${id}`);
      return;
    }

    this.objectsCache.set(id, obj);
    const vtS = this.getVt().s;
    const container = renderObject(obj, this.catalogById, vtS, this.patternRegistry);
    const style = effectiveStyle(obj, this.catalogById);
    container.zIndex = style.z ?? 0;

    if (obj.geom === "line") {
      this.lineEffWidth.set(id, effectiveLineWidth(style, vtS));
    }
    const tilings = container.children.filter((c): c is TilingSprite => c instanceof TilingSprite);
    if (tilings.length > 0) this.patternSprites.set(id, tilings);
    else this.patternSprites.delete(id);

    this.containers.set(id, container);
    this.bboxCache.set(id, objectWorldBBox(obj));
    this.objectLayer.addChild(container);
    this.applyVisibility(id);

    if (import.meta.env.DEV) {
      console.debug(`[PixiApp] rebuilt object: ${id} (geom=${obj.geom})`);
    }
  }

  // vt.s が変化した時だけ呼ぶ（M10-2 で全再構築方式から変更。ズーム毎tickの
  // 2,000本再構築が 342ms/frame の主因だった）。
  //  - point: スクリーン固定スケールをその場更新（安価）
  //  - pattern 付き area/admin: TilingSprite.tileScale をその場更新（再構築なし）
  //  - line: 実効線幅（クランプ後）が 5% 以上変わったものだけ、120ms トレーリングで
  //    再構築。ズームイン域では実効幅 = style.w で不変のため再構築は発生しない。
  private onScaleChange(): void {
    const vtS = this.getVt().s;
    for (const [id, obj] of this.objectsCache) {
      if (obj.geom === "point") {
        const container = this.containers.get(id);
        if (container) {
          const style = effectiveStyle(obj, this.catalogById);
          container.scale.set(symbolScale(style, vtS));
        }
      }
    }
    for (const sprites of this.patternSprites.values()) {
      for (const s of sprites) s.tileScale.set(1 / vtS);
    }
    this.scheduleLineClampPass();
  }

  private scheduleLineClampPass(): void {
    if (this.lineClampTimer !== null) return;
    this.lineClampTimer = window.setTimeout(() => {
      this.lineClampTimer = null;
      if (this.destroyed) return;
      const vtS = this.getVt().s;
      for (const [id, obj] of this.objectsCache) {
        if (obj.geom !== "line") continue;
        const eff = effectiveLineWidth(effectiveStyle(obj, this.catalogById), vtS);
        const prev = this.lineEffWidth.get(id);
        if (prev === undefined || Math.abs(eff - prev) / prev > 0.05) {
          this.rebuildObject(id);
        }
      }
    }, 120);
  }

  private applyVisibility(id: string, precomputedViewport?: BBox): void {
    const container = this.containers.get(id);
    const obj = this.objectsCache.get(id);
    const bb = this.bboxCache.get(id);
    if (!container || !obj || !bb) return;

    const vt = this.getVt();
    const hiddenByLayer = isLayerHidden(obj, this.layerMap, vt.s);
    const viewport =
      precomputedViewport ?? viewportWorldBBox(vt, this.app.screen.width, this.app.screen.height, 100);
    const culled = !intersects(bb, viewport);
    container.visible = !hiddenByLayer && !culled;
  }

  private applyVisibilityAll(): void {
    // 全件走査ではビューポートを一度だけ計算する（パン毎tickの呼び出しがホットパス）。
    const vt = this.getVt();
    const viewport = viewportWorldBBox(vt, this.app.screen.width, this.app.screen.height, 100);
    for (const id of this.containers.keys()) this.applyVisibility(id, viewport);
  }

  private applyTransform(): void {
    const vt = this.getVt();
    this.worldRoot.position.set(vt.x, vt.y);
    this.worldRoot.scale.set(vt.s);
  }

  private renderGridLayer(): void {
    const vt = this.getVt();
    renderGrid(this.gridLayer, vt, this.app.screen.width, this.app.screen.height);
  }

  private renderOverlayLayer(): void {
    renderOverlay(this.overlayLayer);
    renderSnapIndicator(this.overlayLayer, this.lastSnap, this.getVt());
    renderSelectionOverlay(this.overlayLayer, this.lastSelection, this.getVt());
    renderRemoteAwarenessOverlay(
      this.overlayLayer,
      this.remoteAwareness,
      this.cursorPositions,
      (id) => this.mapDoc.getObject(id),
      this.getVt()
    );
  }

  // ToolManager/EditorPage から呼ばれる（実際は uiStore 経由。§M7-4）。
  setRemoteAwareness(entries: RemoteAwarenessEntry[]): void {
    this.remoteAwareness = entries;
    for (const entry of entries) {
      if (entry.state.cursor && !this.cursorPositions.has(entry.clientId)) {
        this.cursorPositions.set(entry.clientId, { ...entry.state.cursor });
      }
    }
    const activeIds = new Set(entries.map((e) => e.clientId));
    for (const id of this.cursorPositions.keys()) {
      if (!activeIds.has(id)) this.cursorPositions.delete(id);
    }
    this.renderOverlayLayer();
  }

  // 200ms 目安の指数補間（実装書 §M7-4）。動きがあった時だけ overlay を再描画する。
  private tickRemoteCursors(deltaMS: number): void {
    if (this.remoteAwareness.length === 0) return;
    const tau = 200;
    const factor = 1 - Math.exp(-deltaMS / tau);
    let moved = false;
    for (const entry of this.remoteAwareness) {
      const target = entry.state.cursor;
      if (!target) continue;
      const current = this.cursorPositions.get(entry.clientId);
      if (!current) {
        this.cursorPositions.set(entry.clientId, { ...target });
        moved = true;
        continue;
      }
      const nx = current.x + (target.x - current.x) * factor;
      const ny = current.y + (target.y - current.y) * factor;
      if (Math.abs(nx - current.x) > 1e-4 || Math.abs(ny - current.y) > 1e-4) {
        current.x = nx;
        current.y = ny;
        moved = true;
      }
    }
    if (moved) this.renderOverlayLayer();
  }

  private renderPreviewLayer(): void {
    const vtS = this.getVt().s;
    if (this.lastPreview) {
      renderDrawPreview(this.previewLayer, this.lastPreview.drawing, this.lastPreview.item, this.lastPreview.cursor, vtS);
    } else {
      renderDrawPreview(this.previewLayer, null, undefined, { x: 0, y: 0 }, vtS);
    }
  }

  // ToolManager から呼ばれる。描画中の頂点列＋カーソルまでのラバーバンドを更新する（§M4-3）。
  setDrawPreview(
    drawing: { pts: Point[]; mode: "straight" | "curve" } | null,
    item: CatalogItem | undefined,
    cursor: Point
  ): void {
    this.lastPreview = { drawing, item, cursor };
    this.renderPreviewLayer();
  }

  // ToolManager から呼ばれる。スナップ確定点のインジケータを更新する（§3.7）。
  setSnapIndicator(snap: SnapResult): void {
    this.lastSnap = snap;
    this.renderOverlayLayer();
  }

  // ToolManager から呼ばれる。選択枠・頂点ハンドル・ラバーバンドを更新する（§M5-2/3）。
  setSelectionOverlay(input: SelectionOverlayState): void {
    this.lastSelection = input;
    this.renderOverlayLayer();
  }

  // ─── M9: エクスポート ───────────────────────────────────────────────────

  // 「現在のビュー」範囲（world bbox）。ExportDialog の範囲選択用。
  getCurrentViewWorldBBox(): BBox {
    const vt = this.getVt();
    return viewportWorldBBox(vt, this.app.screen.width, this.app.screen.height, 0);
  }

  // 「全オブジェクト」範囲（レイヤー非表示・obj.visible=false は除く）。1件も無ければ null。
  getAllObjectsWorldBBox(): BBox | null {
    const vtS = this.getVt().s;
    let result: BBox | null = null;
    for (const [id, obj] of this.objectsCache) {
      if (isLayerHidden(obj, this.layerMap, vtS)) continue;
      const bb = this.bboxCache.get(id);
      if (!bb) continue;
      result = result ? unionBBox(result, bb) : { ...bb };
    }
    return result;
  }

  // 一時的にビューポートカリングを解除し、レイヤー可視性のみを反映した状態にする
  // （エクスポート範囲が現在の画面外に及ぶ場合でも全対象を描画するため）。戻り値は復元用スナップショット。
  private forceVisibilityForExport(): Map<string, boolean> {
    const vtS = this.getVt().s;
    const prev = new Map<string, boolean>();
    for (const [id, container] of this.containers) {
      prev.set(id, container.visible);
      const obj = this.objectsCache.get(id);
      if (!obj) continue;
      container.visible = !isLayerHidden(obj, this.layerMap, vtS);
    }
    return prev;
  }

  private restoreVisibility(prev: Map<string, boolean>): void {
    for (const [id, visible] of prev) {
      const container = this.containers.get(id);
      if (container) container.visible = visible;
    }
  }

  // 指定した world bbox を pxPerMeter で焼き込んだ PNG データURLを返す（実装書 §M9-2）。
  // grid/overlay/preview を一時非表示にし、worldRoot の position/scale を範囲に合わせて
  // 差し替えてから、明示サイズの RenderTexture に renderer.render() で焼き込んで抽出する
  // （Container を target に frame 付きで extract すると、frame が「target 自身の transform
  // 適用前のローカル座標系」で解釈され worldRoot.position/scale の変更が反映されない
  // ことを実機で確認したため、RenderTexture を経由する明示的な方式に変更した）。
  // 処理後は元の表示状態へ復元する。
  async exportRegionToDataUrl(worldBBox: BBox, pxPerMeter: number, backgroundColor = 0xf7f5f0): Promise<string> {
    const prevGrid = this.gridLayer.visible;
    const prevOverlay = this.overlayLayer.visible;
    const prevPreview = this.previewLayer.visible;
    const prevVisibility = this.forceVisibilityForExport();
    const prevX = this.worldRoot.position.x;
    const prevY = this.worldRoot.position.y;
    const prevS = this.worldRoot.scale.x;

    this.gridLayer.visible = false;
    this.overlayLayer.visible = false;
    this.previewLayer.visible = false;

    const w = Math.max(1, Math.round((worldBBox.maxX - worldBBox.minX) * pxPerMeter));
    const h = Math.max(1, Math.round((worldBBox.maxY - worldBBox.minY) * pxPerMeter));
    this.worldRoot.position.set(-worldBBox.minX * pxPerMeter, -worldBBox.minY * pxPerMeter);
    this.worldRoot.scale.set(pxPerMeter);

    const renderTexture = RenderTexture.create({ width: w, height: h });
    try {
      this.app.renderer.render({ container: this.worldRoot, target: renderTexture, clearColor: backgroundColor });
      const image = await this.app.renderer.extract.image({ target: renderTexture });
      return image.src;
    } finally {
      renderTexture.destroy(true);
      this.worldRoot.position.set(prevX, prevY);
      this.worldRoot.scale.set(prevS);
      this.gridLayer.visible = prevGrid;
      this.overlayLayer.visible = prevOverlay;
      this.previewLayer.visible = prevPreview;
      this.restoreVisibility(prevVisibility);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.lineClampTimer !== null) {
      window.clearTimeout(this.lineClampTimer);
      this.lineClampTimer = null;
    }
    for (const u of this.unsubscribers) u();
    this.unsubscribers.length = 0;
    this.patternRegistry.destroy();
    // removeView: true でキャンバス/WebGL context を確実に解放する（次回マウントが
    // クリーンな状態から始まるように。§3.1 のStrictMode対策）。
    this.app.destroy(true, { children: true });
  }
}
