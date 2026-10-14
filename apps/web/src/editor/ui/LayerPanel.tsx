// LayerPanel（実装書 §M5-6）: layerOrder順一覧・ドラッグ並べ替え・visible/lockedトグル・
// 名前ダブルクリック改名・追加/削除（所属オブジェクト数を出してconfirm）・minS/maxS編集
// （縮尺表記セレクト。内部はs値）。
import { useEffect, useReducer, useState } from "react";
import type { Layer } from "@mapcraft/shared";
import { MAX_S, scaleToRatio } from "@mapcraft/shared";
import type { MapDoc } from "../doc/MapDoc.js";
import { useUIStore } from "../state/uiStore.js";

interface LayerPanelProps {
  mapDoc: MapDoc;
}

function useMapDocVersion(mapDoc: MapDoc): void {
  const [, forceRender] = useReducer((c: number) => c + 1, 0);
  useEffect(() => {
    const offObjects = mapDoc.observeObjects(() => forceRender());
    const offLayers = mapDoc.observeLayers(() => forceRender());
    return () => {
      offObjects();
      offLayers();
    };
  }, [mapDoc]);
}

// scaleToRatio（packages/shared/geometry/coords.ts）の逆関数。shared に逆関数が
// 用意されていないため web 側の表示専用ロジックとして定義する（docs/v2-decisions.md 記録）。
const SCREEN_DPI = 96;
const METRES_PER_INCH = 0.0254;
function ratioToS(ratio: number): number {
  return SCREEN_DPI / (METRES_PER_INCH * ratio);
}

// 縮尺プリセット（ratio が大きいほど広域＝s は小さい）。
const RATIO_PRESETS = [
  1000000, 500000, 250000, 100000, 50000, 25000, 10000, 5000, 2500, 1000, 500, 250, 100, 50, 25, 10, 5,
];

interface ScaleOption {
  value: number;
  label: string;
}

function buildScaleOptions(unboundedLabel: string, unboundedValue: number): ScaleOption[] {
  const options = RATIO_PRESETS.map((ratio) => ({ value: ratioToS(ratio), label: `1:${ratio.toLocaleString()}` }));
  return [{ value: unboundedValue, label: unboundedLabel }, ...options];
}

const MIN_S_OPTIONS = buildScaleOptions("無制限（広域まで表示）", 0);
const MAX_S_OPTIONS = buildScaleOptions("無制限（詳細まで表示）", MAX_S);

function nearestOption(options: ScaleOption[], value: number): number {
  let best = options[0]!.value;
  let bestDiff = Infinity;
  for (const opt of options) {
    const diff = Math.abs(opt.value - value);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = opt.value;
    }
  }
  return best;
}

const selectCls = "w-full rounded border border-neutral-300 px-1.5 py-1 text-[11px] outline-none focus:border-neutral-500";

function LayerRow({
  layer,
  mapDoc,
  objectCount,
  dragOver,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  layer: Layer;
  mapDoc: MapDoc;
  objectCount: number;
  dragOver: boolean;
  draggable: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(layer.name);

  const commitName = () => {
    setEditingName(false);
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== layer.name) {
      mapDoc.updateLayer(layer.id, { name: trimmed });
      mapDoc.undo.stopCapturing();
    } else {
      setDraftName(layer.name);
    }
  };

  const toggle = (key: "visible" | "locked") => {
    mapDoc.updateLayer(layer.id, { [key]: !layer[key] });
    mapDoc.undo.stopCapturing();
  };

  const handleDelete = () => {
    const msg =
      objectCount > 0
        ? `レイヤー「${layer.name}」を削除します。所属する${objectCount}件のオブジェクトも削除されます。よろしいですか？`
        : `レイヤー「${layer.name}」を削除します。よろしいですか？`;
    if (window.confirm(msg)) {
      mapDoc.removeLayer(layer.id);
      mapDoc.undo.stopCapturing();
    }
  };

  const setMinS = (v: number) => {
    mapDoc.updateLayer(layer.id, { minS: v });
    mapDoc.undo.stopCapturing();
  };
  const setMaxS = (v: number) => {
    mapDoc.updateLayer(layer.id, { maxS: v });
    mapDoc.undo.stopCapturing();
  };

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`flex flex-col gap-1.5 border-b border-neutral-100 px-2 py-2 ${dragOver ? "bg-blue-50" : ""}`}
    >
      <div className="flex items-center gap-1.5">
        <span className="cursor-grab text-neutral-300 select-none" title="ドラッグで並べ替え">
          ⠿
        </span>
        {editingName ? (
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") {
                setDraftName(layer.name);
                setEditingName(false);
              }
            }}
            className="flex-1 rounded border border-neutral-300 px-1 py-0.5 text-xs"
          />
        ) : (
          <span
            className="flex-1 truncate text-xs font-medium text-neutral-700"
            onDoubleClick={() => setEditingName(true)}
            title="ダブルクリックで改名"
          >
            {layer.name}
          </span>
        )}
        <span className="text-[10px] text-neutral-400">{objectCount}</span>
        <button
          type="button"
          onClick={() => toggle("visible")}
          title={layer.visible ? "非表示にする" : "表示する"}
          className={`h-5 w-5 rounded text-[11px] ${layer.visible ? "text-neutral-700" : "text-neutral-300"}`}
        >
          {layer.visible ? "👁" : "—"}
        </button>
        <button
          type="button"
          onClick={() => toggle("locked")}
          title={layer.locked ? "ロック解除" : "ロック"}
          className={`h-5 w-5 rounded text-[11px] ${layer.locked ? "text-neutral-700" : "text-neutral-300"}`}
        >
          {layer.locked ? "🔒" : "🔓"}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          title="レイヤーを削除"
          className="h-5 w-5 rounded text-[11px] text-neutral-300 hover:text-red-600"
        >
          ✕
        </button>
      </div>

      <div className="flex items-center gap-1 pl-4 text-[10px] text-neutral-400">
        <select
          value={nearestOption(MIN_S_OPTIONS, layer.minS)}
          onChange={(e) => setMinS(Number(e.target.value))}
          className={selectCls}
        >
          {MIN_S_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span>〜</span>
        <select
          value={nearestOption(MAX_S_OPTIONS, layer.maxS)}
          onChange={(e) => setMaxS(Number(e.target.value))}
          className={selectCls}
        >
          {MAX_S_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// role=view のときは一覧を読み取り表示にする（実装書 §M8-5 の「プロパティは読み取り表示」と
// 同じ考え方をレイヤー編集にも適用。ドラッグ並べ替えは HTML5 DnD で fieldset disabled の対象外
// のため draggable 属性自体を落として個別に無効化する）。
export function LayerPanel({ mapDoc }: LayerPanelProps) {
  useMapDocVersion(mapDoc);
  const role = useUIStore((s) => s.role);
  const readonly = role === "view";
  const layers = mapDoc.getLayers();
  const objects = mapDoc.getAllObjects();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const countFor = (layerId: string): number => objects.filter((o) => o.layerId === layerId).length;

  const handleDrop = (targetId: string) => {
    if (readonly) return;
    if (draggingId && draggingId !== targetId) {
      const toIndex = layers.findIndex((l) => l.id === targetId);
      if (toIndex >= 0) mapDoc.moveLayer(draggingId, toIndex);
      mapDoc.undo.stopCapturing();
    }
    setDraggingId(null);
    setDragOverId(null);
  };

  const handleAdd = () => {
    if (readonly) return;
    mapDoc.addLayer("新しいレイヤー");
    mapDoc.undo.stopCapturing();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-neutral-200 px-2 py-1.5">
        <span className="text-xs font-medium text-neutral-600">レイヤー</span>
        {!readonly && (
          <button
            type="button"
            onClick={handleAdd}
            className="rounded px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-neutral-100"
          >
            + 追加
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        <fieldset disabled={readonly} className="contents">
          {layers.map((layer) => (
            <LayerRow
              key={layer.id}
              layer={layer}
              mapDoc={mapDoc}
              objectCount={countFor(layer.id)}
              dragOver={dragOverId === layer.id}
              draggable={!readonly}
              onDragStart={() => setDraggingId(layer.id)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverId(layer.id);
              }}
              onDrop={() => handleDrop(layer.id)}
            />
          ))}
        </fieldset>
      </div>
    </div>
  );
}
