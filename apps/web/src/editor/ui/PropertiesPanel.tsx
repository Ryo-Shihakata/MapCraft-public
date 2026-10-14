// PropertiesPanel（実装書 §M5-5）: 右280px。選択内容で表示を切り替える。
// 単一選択: 別項目への変更・styleOverride編集（300msデバウンスで1undo）・スタイルリセット・
// mode・layerId・name+showLabel・locked/visible・削除。複数選択: 共通操作のみ。
// text オブジェクトの text/fontSize/orientation は M6 のプレースホルダ枠のみ用意する。
import { useEffect, useMemo, useReducer, useRef } from "react";
import type { CatalogItem, Layer, MapObject, StyleDef } from "@mapcraft/shared";
import { CATALOG, CATALOG_BY_ID, effectiveStyle } from "@mapcraft/shared";
import type { MapDoc } from "../doc/MapDoc.js";
import { useUIStore } from "../state/uiStore.js";

const DEBOUNCE_MS = 300;

interface PropertiesPanelProps {
  mapDoc: MapDoc;
}

// mapDoc（Y.Doc）の変更で再レンダリングするための購読フック。
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

// 数値・色の入力は即時反映しつつ、undo 境界は 300ms のデバウンスで確定する
// （実装書 §M5-5: 「数値・色は300msデバウンスで1undo単位に」）。
function useDebouncedCommit(mapDoc: MapDoc): () => void {
  const timerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    []
  );
  return () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      mapDoc.undo.stopCapturing();
      timerRef.current = null;
    }, DEBOUNCE_MS);
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-neutral-600">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

const inputCls = "w-full rounded border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-neutral-500";

function StyleEditor({
  obj,
  mapDoc,
  scheduleCommit,
}: {
  obj: MapObject;
  mapDoc: MapDoc;
  scheduleCommit: () => void;
}) {
  const style = effectiveStyle(obj, CATALOG_BY_ID);

  const patchStyle = (patch: Partial<StyleDef>) => {
    const nextOverride: Partial<StyleDef> = { ...obj.styleOverride, ...patch };
    mapDoc.updateObject(obj.id, { styleOverride: nextOverride });
    scheduleCommit();
  };

  const resetStyle = () => {
    mapDoc.updateObject(obj.id, { styleOverride: undefined });
    mapDoc.undo.stopCapturing();
  };

  const rows: React.ReactNode[] = [];

  if (obj.geom === "line") {
    rows.push(
      <Field key="stroke" label="線色">
        <input
          type="color"
          value={style.stroke ?? "#333333"}
          onChange={(e) => patchStyle({ stroke: e.target.value })}
          className="h-7 w-full rounded border border-neutral-300"
        />
      </Field>,
      <Field key="w" label="線幅 (m)">
        <input
          type="number"
          min={0.1}
          step={0.1}
          value={style.w ?? 2}
          onChange={(e) => patchStyle({ w: Number(e.target.value) })}
          className={inputCls}
        />
      </Field>,
      <Field key="dash" label="破線 (on/off, m)">
        <div className="flex gap-1">
          <input
            type="number"
            min={0}
            value={style.dash?.[0] ?? 0}
            onChange={(e) => patchStyle({ dash: [Number(e.target.value), style.dash?.[1] ?? 0] })}
            className={inputCls}
          />
          <input
            type="number"
            min={0}
            value={style.dash?.[1] ?? 0}
            onChange={(e) => patchStyle({ dash: [style.dash?.[0] ?? 0, Number(e.target.value)] })}
            className={inputCls}
          />
        </div>
      </Field>
    );
  } else if (obj.geom === "area" || obj.geom === "admin" || obj.geom === "rect") {
    rows.push(
      <Field key="fill" label="塗り色">
        <input
          type="color"
          value={(style.fill ?? "#cccccc").slice(0, 7)}
          onChange={(e) => patchStyle({ fill: e.target.value })}
          className="h-7 w-full rounded border border-neutral-300"
        />
      </Field>,
      <Field key="stroke" label="枠線色">
        <input
          type="color"
          value={style.stroke ?? "#333333"}
          onChange={(e) => patchStyle({ stroke: e.target.value })}
          className="h-7 w-full rounded border border-neutral-300"
        />
      </Field>,
      <Field key="sw" label="枠線幅 (m)">
        <input
          type="number"
          min={0}
          step={0.1}
          value={style.sw ?? 1}
          onChange={(e) => patchStyle({ sw: Number(e.target.value) })}
          className={inputCls}
        />
      </Field>
    );
  } else if (obj.geom === "point") {
    rows.push(
      <Field key="color" label="記号色">
        <input
          type="color"
          value={style.color ?? "#222222"}
          onChange={(e) => patchStyle({ color: e.target.value })}
          className="h-7 w-full rounded border border-neutral-300"
        />
      </Field>,
      <Field key="size" label="サイズ (px)">
        <input
          type="number"
          min={4}
          step={1}
          value={style.size ?? 12}
          onChange={(e) => patchStyle({ size: Number(e.target.value) })}
          className={inputCls}
        />
      </Field>
    );
  }

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-t border-neutral-100 pt-2">
      {rows}
      <button
        type="button"
        onClick={resetStyle}
        className="self-start text-[11px] text-neutral-400 underline hover:text-neutral-700"
      >
        スタイルをリセット
      </button>
    </div>
  );
}

// text オブジェクト用の編集欄（実装書 §M6-3: textarea/fontSize/orientation/color）。
function TextFields({
  obj,
  mapDoc,
  scheduleCommit,
}: {
  obj: MapObject;
  mapDoc: MapDoc;
  scheduleCommit: () => void;
}) {
  const commitNow = (patch: Partial<MapObject>) => {
    mapDoc.updateObject(obj.id, patch);
    mapDoc.undo.stopCapturing();
  };

  return (
    <div className="flex flex-col gap-2 border-t border-neutral-100 pt-2">
      <Field label="本文（複数行可）">
        <textarea
          value={obj.text ?? ""}
          onChange={(e) => {
            mapDoc.updateObject(obj.id, { text: e.target.value || undefined });
            scheduleCommit();
          }}
          rows={3}
          className={inputCls}
        />
      </Field>
      <Field label="フォントサイズ (m)">
        <input
          type="number"
          min={10}
          max={10000}
          step={1}
          value={obj.fontSize ?? 100}
          onChange={(e) => {
            mapDoc.updateObject(obj.id, { fontSize: Number(e.target.value) });
            scheduleCommit();
          }}
          className={inputCls}
        />
      </Field>
      <Field label="向き">
        <select
          value={obj.orientation ?? "h"}
          onChange={(e) => commitNow({ orientation: e.target.value as "h" | "v" })}
          className={inputCls}
        >
          <option value="h">横書き</option>
          <option value="v">縦書き</option>
        </select>
      </Field>
      <Field label="文字色">
        <input
          type="color"
          value={obj.styleOverride?.color ?? "#333333"}
          onChange={(e) => {
            mapDoc.updateObject(obj.id, { styleOverride: { ...obj.styleOverride, color: e.target.value } });
            scheduleCommit();
          }}
          className="h-7 w-full rounded border border-neutral-300"
        />
      </Field>
    </div>
  );
}

function SingleObjectPanel({ obj, mapDoc, layers }: { obj: MapObject; mapDoc: MapDoc; layers: Layer[] }) {
  const scheduleCommit = useDebouncedCommit(mapDoc);
  const setSelectedIds = useUIStore((s) => s.setSelectedIds);

  const sameGeomItems = useMemo<CatalogItem[]>(
    () => (obj.geom === "text" ? [] : CATALOG.filter((c) => c.geom === obj.geom)),
    [obj.geom]
  );

  const commitNow = (patch: Partial<MapObject>) => {
    mapDoc.updateObject(obj.id, patch);
    mapDoc.undo.stopCapturing();
  };

  const handleDelete = () => {
    mapDoc.deleteObjects([obj.id]);
    mapDoc.undo.stopCapturing();
    setSelectedIds([]);
  };

  const catalogItem = obj.geom === "text" ? undefined : CATALOG_BY_ID[obj.itemId];

  return (
    <div className="flex flex-col gap-3 p-3 text-xs text-neutral-700">
      <div className="flex items-center justify-between">
        <span className="font-semibold">{obj.geom === "text" ? "テキスト" : (catalogItem?.name ?? obj.itemId)}</span>
        <span className="text-neutral-400">1件選択</span>
      </div>

      {obj.geom === "text" ? (
        <TextFields obj={obj} mapDoc={mapDoc} scheduleCommit={scheduleCommit} />
      ) : (
        <>
          {sameGeomItems.length > 0 && (
            <Field label="種別">
              <select
                value={obj.itemId}
                onChange={(e) => commitNow({ itemId: e.target.value })}
                className={inputCls}
              >
                {sameGeomItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <StyleEditor obj={obj} mapDoc={mapDoc} scheduleCommit={scheduleCommit} />

          {(obj.geom === "line" || obj.geom === "area" || obj.geom === "admin") && (
            <Field label="頂点補間">
              <select
                value={obj.mode ?? "straight"}
                onChange={(e) => commitNow({ mode: e.target.value as "straight" | "curve" })}
                className={inputCls}
              >
                <option value="straight">直線</option>
                <option value="curve">曲線</option>
              </select>
            </Field>
          )}
        </>
      )}

      <Field label="レイヤー">
        <select value={obj.layerId} onChange={(e) => commitNow({ layerId: e.target.value })} className={inputCls}>
          {layers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </Field>

      {obj.geom !== "text" && (
        <div className="flex flex-col gap-2 border-t border-neutral-100 pt-2">
          <Field label="ラベル名">
            <input
              type="text"
              value={obj.name ?? ""}
              onChange={(e) => {
                mapDoc.updateObject(obj.id, { name: e.target.value || undefined });
                scheduleCommit();
              }}
              className={inputCls}
            />
          </Field>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={obj.showLabel ?? false}
              onChange={(e) => commitNow({ showLabel: e.target.checked })}
            />
            ラベルを表示
          </label>
        </div>
      )}

      <div className="flex flex-col gap-1 border-t border-neutral-100 pt-2">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={obj.locked ?? false}
            onChange={(e) => commitNow({ locked: e.target.checked })}
          />
          ロック
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={obj.visible ?? true}
            onChange={(e) => commitNow({ visible: e.target.checked })}
          />
          表示
        </label>
      </div>

      <button
        type="button"
        onClick={handleDelete}
        className="mt-1 rounded border border-red-200 px-2 py-1.5 text-xs text-red-600 hover:bg-red-50"
      >
        削除
      </button>
    </div>
  );
}

function MultiObjectPanel({ objects, mapDoc, layers }: { objects: MapObject[]; mapDoc: MapDoc; layers: Layer[] }) {
  const setSelectedIds = useUIStore((s) => s.setSelectedIds);
  const ids = objects.map((o) => o.id);

  const setLayer = (layerId: string) => {
    mapDoc.transact(() => {
      for (const id of ids) mapDoc.updateObject(id, { layerId });
    });
    mapDoc.undo.stopCapturing();
  };

  const setVisible = (visible: boolean) => {
    mapDoc.transact(() => {
      for (const id of ids) mapDoc.updateObject(id, { visible });
    });
    mapDoc.undo.stopCapturing();
  };

  const setLocked = (locked: boolean) => {
    mapDoc.transact(() => {
      for (const id of ids) mapDoc.updateObject(id, { locked });
    });
    mapDoc.undo.stopCapturing();
  };

  const handleDelete = () => {
    mapDoc.deleteObjects(ids);
    mapDoc.undo.stopCapturing();
    setSelectedIds([]);
  };

  return (
    <div className="flex flex-col gap-3 p-3 text-xs text-neutral-700">
      <div className="flex items-center justify-between">
        <span className="font-semibold">複数選択</span>
        <span className="text-neutral-400">{objects.length}件選択</span>
      </div>

      <Field label="レイヤー（一括変更）">
        <select defaultValue="" onChange={(e) => e.target.value && setLayer(e.target.value)} className={inputCls}>
          <option value="" disabled>
            変更しない
          </option>
          {layers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex gap-2">
        <button type="button" onClick={() => setVisible(true)} className="flex-1 rounded border border-neutral-300 py-1 hover:bg-neutral-50">
          表示
        </button>
        <button type="button" onClick={() => setVisible(false)} className="flex-1 rounded border border-neutral-300 py-1 hover:bg-neutral-50">
          非表示
        </button>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => setLocked(true)} className="flex-1 rounded border border-neutral-300 py-1 hover:bg-neutral-50">
          ロック
        </button>
        <button type="button" onClick={() => setLocked(false)} className="flex-1 rounded border border-neutral-300 py-1 hover:bg-neutral-50">
          ロック解除
        </button>
      </div>

      <button
        type="button"
        onClick={handleDelete}
        className="mt-1 rounded border border-red-200 px-2 py-1.5 text-xs text-red-600 hover:bg-red-50"
      >
        まとめて削除
      </button>
    </div>
  );
}

// role=view のときはプロパティを読み取り表示にする（実装書 §M8-5: 「プロパティは読み取り表示」）。
// <fieldset disabled> はネストした全 input/select/textarea/button を一括で無効化するため、
// 各フィールドの onChange 側に readonly 分岐を書き足す必要がない。display:contents で
// レイアウト（flex 子要素の並び）には影響させない。
export function PropertiesPanel({ mapDoc }: PropertiesPanelProps) {
  useMapDocVersion(mapDoc);
  const selectedIds = useUIStore((s) => s.selectedIds);
  const role = useUIStore((s) => s.role);
  const readonly = role === "view";
  const layers = mapDoc.getLayers();
  const objects = selectedIds.map((id) => mapDoc.getObject(id)).filter((o): o is MapObject => !!o);

  if (objects.length === 0) {
    return <div className="p-3 text-xs text-neutral-400">オブジェクトを選択するとプロパティが表示されます。</div>;
  }

  return (
    <fieldset disabled={readonly} className="contents">
      {objects.length === 1 ? (
        <SingleObjectPanel obj={objects[0]!} mapDoc={mapDoc} layers={layers} />
      ) : (
        <MultiObjectPanel objects={objects} mapDoc={mapDoc} layers={layers} />
      )}
    </fieldset>
  );
}
