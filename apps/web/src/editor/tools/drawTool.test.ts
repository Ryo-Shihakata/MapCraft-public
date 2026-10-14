// drawTool の確定ロジックを検証する（実装書 M4-3: レイヤーロック時の拒否・
// 1確定=1 undo単位・admin の name/showLabel 既定値）。
// LayerPanel（ロック切替 UI）は M5 のため、ここでは MapDoc.updateLayer を直接呼んで
// ロック状態を再現する。
import { beforeEach, describe, expect, it } from "vitest";
import type { CatalogItem } from "@mapcraft/shared";
import { MapDoc } from "../doc/MapDoc.js";
import { seedLocalDefaults } from "../doc/seed.js";
import { useUIStore } from "../state/uiStore.js";
import { drawTool } from "./drawTool.js";

// defaultLayerFor が返す layerId（transport/buildings 等）は DEFAULT_LAYERS に
// 実在して初めて updateLayer("...", { locked: true }) が効く。実アプリの
// EditorPage も常に seedLocalDefaults を呼んでから MapDoc を使うため、テストでも揃える。
function createSeededMapDoc(): MapDoc {
  const mapDoc = new MapDoc();
  seedLocalDefaults(mapDoc);
  return mapDoc;
}

const ROAD_ITEM: CatalogItem = {
  id: "national",
  name: "国道",
  cat: "道路",
  geom: "line",
  style: { stroke: "#ffff00", w: 10, z: 40 },
};

const ADMIN_ITEM: CatalogItem = {
  id: "adm-city",
  name: "市区町村",
  cat: "行政区分",
  geom: "admin",
  style: { fill: "#ccccff22", stroke: "#446688", sw: 1, z: 2 },
};

const STATION_ITEM: CatalogItem = {
  id: "station",
  name: "駅",
  cat: "施設（点）",
  geom: "point",
  style: { sym: "station", color: "#222222", size: 14, z: 84 },
};

function resetUIStore(): void {
  useUIStore.setState({
    tool: "select",
    activeItemId: null,
    selectedIds: [],
    editingVertex: null,
    drawing: null,
    statusMessage: null,
  });
}

beforeEach(() => {
  resetUIStore();
});

describe("drawTool.commit（line/area/admin）", () => {
  it("2点未満の line は確定しない", () => {
    const mapDoc = createSeededMapDoc();
    useUIStore.getState().setDrawing({ pts: [{ x: 0, y: 0 }], mode: "straight" });
    expect(drawTool.commit(ROAD_ITEM, mapDoc)).toBe(false);
    expect(mapDoc.getAllObjects()).toHaveLength(0);
  });

  it("2点以上の line は確定し、drawing がクリアされる", () => {
    const mapDoc = createSeededMapDoc();
    useUIStore.getState().setDrawing({
      pts: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      mode: "straight",
    });
    expect(drawTool.commit(ROAD_ITEM, mapDoc)).toBe(true);
    const objs = mapDoc.getAllObjects();
    expect(objs).toHaveLength(1);
    expect(objs[0]!.geom).toBe("line");
    expect(objs[0]!.layerId).toBe("transport"); // defaultLayerFor(道路)
    expect(useUIStore.getState().drawing).toBeNull();
  });

  it("admin は確定時に name/showLabel の既定値が入る", () => {
    const mapDoc = createSeededMapDoc();
    useUIStore.getState().setDrawing({
      pts: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      mode: "straight",
    });
    expect(drawTool.commit(ADMIN_ITEM, mapDoc)).toBe(true);
    const obj = mapDoc.getAllObjects()[0]!;
    expect(obj.name).toBe("新しい領域");
    expect(obj.showLabel).toBe(true);
  });

  it("対象レイヤーがロック中なら確定を拒否し、statusMessage を設定する", () => {
    const mapDoc = createSeededMapDoc();
    mapDoc.updateLayer("transport", { locked: true });
    useUIStore.getState().setDrawing({
      pts: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      mode: "straight",
    });
    expect(drawTool.commit(ROAD_ITEM, mapDoc)).toBe(false);
    expect(mapDoc.getAllObjects()).toHaveLength(0);
    // drawing はロック拒否時にはクリアされない（ユーザーが頂点をやり直せるように）
    expect(useUIStore.getState().drawing).not.toBeNull();
    expect(useUIStore.getState().statusMessage).toMatch(/ロック/);
  });
});

describe("drawTool.placePoint", () => {
  it("ロック中でなければ即確定する", () => {
    const mapDoc = createSeededMapDoc();
    expect(drawTool.placePoint(STATION_ITEM, { x: 10, y: 20 }, mapDoc)).toBe(true);
    expect(mapDoc.getAllObjects()).toHaveLength(1);
  });

  it("ロック中のレイヤーには確定しない", () => {
    const mapDoc = createSeededMapDoc();
    mapDoc.updateLayer("buildings", { locked: true }); // station -> 施設（点） -> buildings
    expect(drawTool.placePoint(STATION_ITEM, { x: 10, y: 20 }, mapDoc)).toBe(false);
    expect(mapDoc.getAllObjects()).toHaveLength(0);
    expect(useUIStore.getState().statusMessage).toMatch(/ロック/);
  });
});

describe("drawTool 頂点操作（addVertex/removeLastVertex/toggleMode/cancel）", () => {
  it("addVertex を繰り返すと drawing.pts が積み上がる", () => {
    drawTool.addVertex({ x: 0, y: 0 });
    drawTool.addVertex({ x: 1, y: 1 });
    expect(useUIStore.getState().drawing?.pts).toHaveLength(2);
  });

  it("removeLastVertex は末尾を取り除き、0件になれば drawing を破棄する", () => {
    useUIStore.getState().setDrawing({ pts: [{ x: 0, y: 0 }], mode: "straight" });
    drawTool.removeLastVertex();
    expect(useUIStore.getState().drawing).toBeNull();
  });

  it("toggleMode は straight/curve を反転する", () => {
    useUIStore.getState().setDrawing({ pts: [{ x: 0, y: 0 }], mode: "straight" });
    drawTool.toggleMode();
    expect(useUIStore.getState().drawing?.mode).toBe("curve");
    drawTool.toggleMode();
    expect(useUIStore.getState().drawing?.mode).toBe("straight");
  });

  it("cancel は drawing を破棄する", () => {
    useUIStore.getState().setDrawing({ pts: [{ x: 0, y: 0 }], mode: "straight" });
    drawTool.cancel();
    expect(useUIStore.getState().drawing).toBeNull();
  });
});
