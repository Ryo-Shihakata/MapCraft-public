// MapRoom の update merge/diff ロジック（純関数）のユニットテスト（§M7 DoD）。
// DO を一切インスタンス化せず、update レベル API のみで応答できることを検証する。
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { computeDiff, computeMergedUpdate, computeStateVector, EMPTY_STATE_VECTOR, EMPTY_UPDATE } from "./sync.js";

function makeUpdate(fn: (doc: Y.Doc) => void): Uint8Array {
  const doc = new Y.Doc();
  fn(doc);
  const update = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return update;
}

describe("computeMergedUpdate", () => {
  it("0行なら null を返す（Y.Doc を作らない）", () => {
    expect(computeMergedUpdate([])).toBeNull();
  });

  it("1行ならその行をそのまま返す（mergeUpdates を呼ばない）", () => {
    const update = makeUpdate((doc) => doc.getMap("meta").set("schemaVersion", 2));
    const merged = computeMergedUpdate([update]);
    expect(merged).toBe(update);
  });

  it("複数行は Y.mergeUpdates と同じ結果になる", () => {
    const a = makeUpdate((doc) => doc.getMap("layers").set("terrain", "x"));
    const b = makeUpdate((doc) => doc.getMap("layers").set("water", "y"));
    const merged = computeMergedUpdate([a, b]);
    expect(merged).not.toBeNull();

    // merged を適用した Y.Doc が両方の変更を含むこと（実際に applyUpdate できるのが
    // 「Y.Doc をインスタンス化せず update だけで応答できる」ことの検証になる）。
    const doc = new Y.Doc();
    Y.applyUpdate(doc, merged!);
    expect(doc.getMap("layers").get("terrain")).toBe("x");
    expect(doc.getMap("layers").get("water")).toBe("y");
    doc.destroy();
  });
});

describe("computeStateVector", () => {
  it("merged が null なら空 Y.Doc と同じ state vector を返す", () => {
    const emptyDocSv = Y.encodeStateVector(new Y.Doc());
    const sv = computeStateVector(null);
    expect(sv).toEqual(EMPTY_STATE_VECTOR);
    expect(sv).toEqual(emptyDocSv);
  });

  it("merged がある場合は Y.encodeStateVectorFromUpdate と一致する", () => {
    const update = makeUpdate((doc) => doc.getMap("meta").set("schemaVersion", 2));
    const sv = computeStateVector(update);
    expect(sv).toEqual(Y.encodeStateVectorFromUpdate(update));
  });
});

describe("computeDiff", () => {
  it("merged が null なら空 update（Y.Doc 未介在）を返す", () => {
    const emptyDocUpdate = Y.encodeStateAsUpdate(new Y.Doc());
    const diff = computeDiff(null, EMPTY_STATE_VECTOR);
    expect(diff).toEqual(EMPTY_UPDATE);
    expect(diff).toEqual(emptyDocUpdate);
  });

  it("リモートの state vector に対する差分が、フル同期と同じ結果になる往復（sync handshake の核）", () => {
    // サーバー側: DO の updates 相当（Y.Doc をインスタンス化せず update のみで持つ）
    const serverUpdate = makeUpdate((doc) => {
      doc.getMap("layers").set("terrain", "t");
      doc.getMap("layers").set("water", "w");
    });

    // クライアント A: 何も持たない新規クライアント（state vector = 空）
    const clientA = new Y.Doc();
    const diffForA = computeDiff(serverUpdate, Y.encodeStateVector(clientA));
    Y.applyUpdate(clientA, diffForA);
    expect(clientA.getMap("layers").get("terrain")).toBe("t");
    expect(clientA.getMap("layers").get("water")).toBe("w");

    // クライアント B: すでに一部の状態を持っている（再接続シナリオ）→ 差分のみ受け取る
    const clientB = new Y.Doc();
    Y.applyUpdate(clientB, serverUpdate);
    const diffForB = computeDiff(serverUpdate, Y.encodeStateVector(clientB));
    // clientB は既に最新なので diff は「変更なし」を表す最小の update になる
    const doc = new Y.Doc();
    Y.applyUpdate(doc, diffForB);
    expect(doc.getMap("layers").toJSON()).toEqual({});

    clientA.destroy();
    clientB.destroy();
    doc.destroy();
  });
});

describe("圧縮シナリオ（§M7 DoD: 201 update 投入で 1 行に縮む）", () => {
  it("201件の細粒度 update を1行にマージしても内容が保存される", () => {
    const rows: Uint8Array[] = [];
    // 1件目でスキーマを立てる
    rows.push(makeUpdate((doc) => doc.getMap("meta").set("schemaVersion", 2)));
    for (let i = 0; i < 200; i++) {
      const doc = new Y.Doc();
      Y.applyUpdate(doc, computeMergedUpdate(rows)!);
      doc.getMap("objects").set(`obj-${i}`, i);
      const update = Y.encodeStateAsUpdate(doc, Y.encodeStateVectorFromUpdate(computeMergedUpdate(rows)!));
      rows.push(update);
      doc.destroy();
    }
    expect(rows.length).toBe(201);

    const merged = computeMergedUpdate(rows);
    expect(merged).not.toBeNull();

    // 1行（1つの update バイナリ）に圧縮された状態から全オブジェクトが復元できる。
    const doc = new Y.Doc();
    Y.applyUpdate(doc, merged!);
    expect(doc.getMap("objects").size).toBe(200);
    expect(doc.getMap("meta").get("schemaVersion")).toBe(2);
    doc.destroy();
  });
});
