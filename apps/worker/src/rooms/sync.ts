// MapRoom の update merge/diff ロジック（純関数。§4.3）。
// "cloudflare:workers" に依存しないため、Node 上の vitest でそのままテストできる
// （MapRoom.ts は DurableObject クラス本体のみを持ち、ここから import する）。
import * as Y from "yjs";

// 空 Y.Doc の state vector / update のバイト表現（Y.Doc を作らずに固定値で代用する）。
export const EMPTY_STATE_VECTOR = new Uint8Array([0]);
export const EMPTY_UPDATE = new Uint8Array([0, 0]);

/** SQLite の updates テーブル行列を 1本の update にまとめる（0行なら null）。 */
export function computeMergedUpdate(rows: Uint8Array[]): Uint8Array | null {
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0]!;
  return Y.mergeUpdates(rows);
}

export function computeStateVector(merged: Uint8Array | null): Uint8Array {
  return merged ? Y.encodeStateVectorFromUpdate(merged) : EMPTY_STATE_VECTOR;
}

export function computeDiff(merged: Uint8Array | null, remoteSV: Uint8Array): Uint8Array {
  return merged ? Y.diffUpdate(merged, remoteSV) : EMPTY_UPDATE;
}
