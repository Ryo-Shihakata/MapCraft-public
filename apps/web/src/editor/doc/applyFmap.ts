// .fmap インポートの適用（実装書 §M9-4）。Dashboard の「.fmap をインポート」→
// 空の新規マップを作成 → EditorPage の初回 sync 完了後にここを呼ぶ。
// MapDoc の公開 API のみを使い、1トランザクションで layers/layerOrder 置換＋objects 全挿入する
// （設計上の絶対則: Y.Doc への直接アクセスは MapDoc 経由のみ）。
import type { FmapFile } from "@mapcraft/shared";
import type { MapDoc } from "./MapDoc.js";

export function applyFmapImport(mapDoc: MapDoc, file: FmapFile): void {
  mapDoc.transact(() => {
    // 既存レイヤー（サーバーが作成時に積んだ DEFAULT_LAYERS）を全削除。
    // MapDoc.removeLayer は所属オブジェクトも削除するため、layers/objects 両方が空になる。
    for (const layer of mapDoc.getLayers()) mapDoc.removeLayer(layer.id);

    // インポートしたレイヤーを layerOrder の順で挿入（レイヤー ID は据え置き。
    // objects.layerId の参照整合性を保つため、レイヤー ID までは新規採番しない）。
    for (const id of file.layerOrder) {
      const layer = file.layers.find((l) => l.id === id);
      if (layer) mapDoc.upsertLayer(layer);
    }
    // layerOrder に含まれない孤立レイヤーがあれば末尾に追加する（不正なファイルへの耐性）。
    for (const layer of file.layers) {
      if (!file.layerOrder.includes(layer.id)) mapDoc.upsertLayer(layer);
    }

    // オブジェクトは ID を新規採番し直して挿入する（複数回インポートしても衝突しない）。
    for (const obj of file.objects) {
      mapDoc.upsertObject({ ...obj, id: crypto.randomUUID(), createdAt: Date.now() });
    }
  });
}
