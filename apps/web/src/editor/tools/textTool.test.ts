// textTool の確定ロジックを検証する（実装書 §M6-1: 新規テキストの空文字破棄・
// ロック中レイヤーへの拒否・既存テキストの再編集）。drawTool.test.ts と同じ
// パターンで MapDoc.updateLayer を直接呼んでロック状態を再現する。
import { beforeEach, describe, expect, it } from "vitest";
import { MapDoc } from "../doc/MapDoc.js";
import { seedLocalDefaults } from "../doc/seed.js";
import { useUIStore } from "../state/uiStore.js";
import { textTool } from "./textTool.js";

function createSeededMapDoc(): MapDoc {
  const mapDoc = new MapDoc();
  seedLocalDefaults(mapDoc);
  return mapDoc;
}

function resetUIStore(): void {
  useUIStore.setState({
    tool: "select",
    activeItemId: null,
    selectedIds: [],
    editingVertex: null,
    drawing: null,
    statusMessage: null,
    textEdit: null,
  });
}

beforeEach(() => {
  resetUIStore();
});

describe("textTool.commitNew", () => {
  it("空文字は破棄する（オブジェクトを作らない）", () => {
    const mapDoc = createSeededMapDoc();
    expect(textTool.commitNew(mapDoc, { x: 0, y: 0 }, "   ")).toBe(false);
    expect(mapDoc.getAllObjects()).toHaveLength(0);
  });

  it("非空文字は geom:text の MapObject として確定する", () => {
    const mapDoc = createSeededMapDoc();
    expect(textTool.commitNew(mapDoc, { x: 10, y: 20 }, "架空市駅前通り")).toBe(true);
    const objs = mapDoc.getAllObjects();
    expect(objs).toHaveLength(1);
    const obj = objs[0]!;
    expect(obj.geom).toBe("text");
    expect(obj.itemId).toBe("text");
    expect(obj.text).toBe("架空市駅前通り");
    expect(obj.fontSize).toBe(100);
    expect(obj.orientation).toBe("h");
    expect(obj.layerId).toBe("annotation");
    expect(obj.pt).toEqual({ x: 10, y: 20 });
  });

  it("注記レイヤーがロック中なら確定を拒否し、statusMessage を設定する", () => {
    const mapDoc = createSeededMapDoc();
    mapDoc.updateLayer("annotation", { locked: true });
    expect(textTool.commitNew(mapDoc, { x: 0, y: 0 }, "地名")).toBe(false);
    expect(mapDoc.getAllObjects()).toHaveLength(0);
    expect(useUIStore.getState().statusMessage).toMatch(/ロック/);
  });
});

describe("textTool.commitEdit", () => {
  it("既存テキストの本文を更新する", () => {
    const mapDoc = createSeededMapDoc();
    textTool.commitNew(mapDoc, { x: 0, y: 0 }, "旧地名");
    const id = mapDoc.getAllObjects()[0]!.id;
    expect(textTool.commitEdit(mapDoc, id, "新地名")).toBe(true);
    expect(mapDoc.getObject(id)?.text).toBe("新地名");
  });

  it("空文字は破棄する（元のテキストを変更しない）", () => {
    const mapDoc = createSeededMapDoc();
    textTool.commitNew(mapDoc, { x: 0, y: 0 }, "旧地名");
    const id = mapDoc.getAllObjects()[0]!.id;
    expect(textTool.commitEdit(mapDoc, id, "  ")).toBe(false);
    expect(mapDoc.getObject(id)?.text).toBe("旧地名");
  });

  it("存在しない id は false を返す", () => {
    const mapDoc = createSeededMapDoc();
    expect(textTool.commitEdit(mapDoc, "no-such-id", "x")).toBe(false);
  });
});
