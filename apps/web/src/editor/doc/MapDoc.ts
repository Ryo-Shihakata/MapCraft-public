// Y.Doc を隠蔽する唯一の窓口（docs/v2-implementation.md §2.3）。
// コンポーネントから直接 Y.Doc を触らないこと。地図データの読み書きは必ずここ経由。
import * as Y from "yjs";
import type { Layer, MapObject } from "@mapcraft/shared";

// このドキュメントインスタンスからのローカル編集を示す origin。
// Y.UndoManager の trackedOrigins に登録し、自分の変更だけを Undo 対象にする。
export const LOCAL_ORIGIN = Symbol("local");

function toYMap(obj: Record<string, unknown>): Y.Map<unknown> {
  const y = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) y.set(k, v);
  }
  return y;
}

export class MapDoc {
  readonly doc: Y.Doc;
  readonly undo: Y.UndoManager;

  private readonly yObjects: Y.Map<Y.Map<unknown>>;
  private readonly yLayers: Y.Map<Y.Map<unknown>>;
  private readonly yLayerOrder: Y.Array<string>;
  private readonly yMeta: Y.Map<unknown>;

  constructor(doc: Y.Doc = new Y.Doc()) {
    this.doc = doc;
    this.yObjects = doc.getMap<Y.Map<unknown>>("objects");
    this.yLayers = doc.getMap<Y.Map<unknown>>("layers");
    this.yLayerOrder = doc.getArray<string>("layerOrder");
    this.yMeta = doc.getMap("meta");
    if (this.yMeta.get("schemaVersion") === undefined) {
      // meta 自体はローカル編集トラッキングの対象外（objects/layers/layerOrder のみ scope）
      // だが schemaVersion は一度だけセットすればよいので transact 外でも問題ない。
      this.yMeta.set("schemaVersion", 2);
    }

    this.undo = new Y.UndoManager([this.yObjects, this.yLayers, this.yLayerOrder], {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
    });
  }

  transact(fn: () => void): void {
    this.doc.transact(fn, LOCAL_ORIGIN);
  }

  // ─── objects ────────────────────────────────────────────────────────────

  getObject(id: string): MapObject | undefined {
    const y = this.yObjects.get(id);
    return y ? (y.toJSON() as MapObject) : undefined;
  }

  getAllObjects(): MapObject[] {
    const out: MapObject[] = [];
    this.yObjects.forEach((y) => out.push(y.toJSON() as MapObject));
    return out;
  }

  upsertObject(obj: MapObject): void {
    this.transact(() => {
      this.yObjects.set(obj.id, toYMap(obj as unknown as Record<string, unknown>));
    });
  }

  // undefined 値のキーはフィールド削除。exactOptionalPropertyTypes 下で
  // `{ name: undefined }` のような明示的なフィールド削除パッチを型エラーなく渡せるよう、
  // Partial<MapObject> の各プロパティに明示的に `| undefined` を許容する（実装書 §M5-5:
  // PropertiesPanel のスタイルリセット・ラベル名クリア等で使用）。
  updateObject(id: string, patch: { [K in keyof MapObject]?: MapObject[K] | undefined }): void {
    this.transact(() => {
      const y = this.yObjects.get(id);
      if (!y) return;
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) y.delete(k);
        else y.set(k, v);
      }
    });
  }

  deleteObjects(ids: string[]): void {
    this.transact(() => {
      for (const id of ids) this.yObjects.delete(id);
    });
  }

  // ─── layers ─────────────────────────────────────────────────────────────

  getLayers(): Layer[] {
    const order = this.yLayerOrder.toArray();
    const out: Layer[] = [];
    for (const id of order) {
      const y = this.yLayers.get(id);
      if (y) out.push(y.toJSON() as Layer);
    }
    return out;
  }

  // upsertObject と対の便宜メソッド（実装書の MapDoc API 一覧には無いが、
  // addLayer / seedLocalDefaults の内部実装を共通化するための追加）。
  upsertLayer(layer: Layer): void {
    this.transact(() => {
      this.yLayers.set(layer.id, toYMap(layer as unknown as Record<string, unknown>));
      if (!this.yLayerOrder.toArray().includes(layer.id)) {
        this.yLayerOrder.push([layer.id]);
      }
    });
  }

  updateLayer(id: string, patch: Partial<Layer>): void {
    this.transact(() => {
      const y = this.yLayers.get(id);
      if (!y) return;
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) y.delete(k);
        else y.set(k, v);
      }
    });
  }

  addLayer(name: string): Layer {
    const layer: Layer = {
      id: crypto.randomUUID(),
      name,
      visible: true,
      locked: false,
      minS: 0,
      maxS: 1e9,
    };
    this.upsertLayer(layer);
    return layer;
  }

  // 所属オブジェクトも削除する（確認UIは呼び出し側の責務）
  removeLayer(id: string): void {
    this.transact(() => {
      this.yLayers.delete(id);
      const idx = this.yLayerOrder.toArray().indexOf(id);
      if (idx >= 0) this.yLayerOrder.delete(idx, 1);
      const toDelete: string[] = [];
      this.yObjects.forEach((y, objId) => {
        if (y.get("layerId") === id) toDelete.push(objId);
      });
      for (const objId of toDelete) this.yObjects.delete(objId);
    });
  }

  moveLayer(id: string, toIndex: number): void {
    this.transact(() => {
      const arr = this.yLayerOrder.toArray();
      const from = arr.indexOf(id);
      if (from < 0) return;
      this.yLayerOrder.delete(from, 1);
      const clamped = Math.max(0, Math.min(toIndex, this.yLayerOrder.length));
      this.yLayerOrder.insert(clamped, [id]);
    });
  }

  // ─── observers ──────────────────────────────────────────────────────────

  // Yjs の deep observer を「変更された MapObject.id の集合」に正規化する。
  observeObjects(cb: (changedIds: Set<string>) => void): () => void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Yjs observeDeep の上流型が YEvent<any>[]
    const handler = (events: Y.YEvent<any>[]): void => {
      const changed = new Set<string>();
      for (const event of events) {
        if (event.target === this.yObjects) {
          // オブジェクトの追加/削除（objects 直下のキー変化）
          for (const key of event.keys.keys()) changed.add(key);
        } else {
          // 既存オブジェクトのフィールド変更。path[0] が対象オブジェクトの id。
          const id = event.path[0];
          if (typeof id === "string") changed.add(id);
        }
      }
      if (changed.size > 0) cb(changed);
    };
    this.yObjects.observeDeep(handler);
    return () => this.yObjects.unobserveDeep(handler);
  }

  observeLayers(cb: () => void): () => void {
    const handler = (): void => cb();
    this.yLayers.observeDeep(handler);
    this.yLayerOrder.observe(handler);
    return () => {
      this.yLayers.unobserveDeep(handler);
      this.yLayerOrder.unobserve(handler);
    };
  }

  destroy(): void {
    this.undo.destroy();
    this.doc.destroy();
  }
}
