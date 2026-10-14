// Figma型レイアウト枠（実装書 §3.9）。CatalogPanel は M4、PropertiesPanel/LayerPanel は M5 で実装。
import { useEffect, useState } from "react";
import type { PixiApp } from "../canvas/PixiApp.js";
import type { MapDoc } from "../doc/MapDoc.js";
import { generateAndUploadThumbnail } from "../../export/thumbnail.js";
import { useUIStore } from "../state/uiStore.js";
import { CatalogPanel } from "./CatalogPanel.js";
import { LayerPanel } from "./LayerPanel.js";
import { PixiCanvas } from "./PixiCanvas.js";
import { PropertiesPanel } from "./PropertiesPanel.js";
import { StatusBar } from "./StatusBar.js";
import { ToolBar } from "./ToolBar.js";
import { TopBar } from "./TopBar.js";

const THUMBNAIL_IDLE_MS = 30_000;

interface EditorLayoutProps {
  mapDoc: MapDoc;
  mapName: string;
  backHref: string;
  initialScale?: number | undefined;
  // サーバー同期マップの id。共有ダイアログ（TopBar「共有」§M8-3）・サムネイル自動生成
  // （§M9-5）はこれが無いと動作しない（/dev/editor 等ローカル専用ルートでは未指定のまま
  // 渡され、該当ボタン・機能自体を無効化する）。
  mapId?: string | undefined;
}

// M10-1/M10-2: Playwright E2E・性能計測からアプリ内部状態を観測/操作するためのデバッグフック。
// import.meta.env.DEV のときのみ window に生やす（本番ビルドでは tree-shake で消える。
// /dev/editor の非認証バイパスと同じ方針。docs/v2-decisions.md 参照）。
// touchOneObject: 既存オブジェクト1件に無害な単一フィールド変更を加える（M10-2 の性能計測
// ③「1オブジェクト編集の再描画 < 5ms」用。PixiApp.observeObjects のタイミングログで計測する）。
declare global {
  interface Window {
    __mapcraft?: { getObjectCount: () => number; touchOneObject: () => void };
  }
}

export function EditorLayout({ mapDoc, mapName, backHref, initialScale, mapId }: EditorLayoutProps) {
  const tool = useUIStore((s) => s.tool);
  // M9: エクスポート・サムネイル生成が PixiApp インスタンスを必要とするため、
  // PixiCanvas から通知された最新のインスタンスを保持し TopBar（ExportDialog）へ渡す。
  const [pixiApp, setPixiApp] = useState<PixiApp | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.__mapcraft = {
      getObjectCount: () => mapDoc.getAllObjects().length,
      touchOneObject: () => {
        const obj = mapDoc.getAllObjects()[0];
        if (!obj) return;
        // createdAt の書き換えは描画に影響しない無害な単一フィールド更新（M10-2 計測用）。
        mapDoc.updateObject(obj.id, { createdAt: Date.now() });
      },
    };
    return () => {
      delete window.__mapcraft;
    };
  }, [mapDoc]);

  // M9-5: サムネイル自動生成。「最後の編集から30秒後」（mapDoc の変更で毎回タイマーを
  // リセット）または beforeunload 時に PNG パイプラインで生成し POST する。
  // サーバー同期マップ（mapId あり）かつ PixiApp 初期化済みのときのみ動作する。
  useEffect(() => {
    if (!mapId || !pixiApp) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleThumbnail = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void generateAndUploadThumbnail(pixiApp, mapId);
      }, THUMBNAIL_IDLE_MS);
    };

    const unsubscribeObjects = mapDoc.observeObjects(scheduleThumbnail);
    const unsubscribeLayers = mapDoc.observeLayers(scheduleThumbnail);

    const onBeforeUnload = () => {
      // ベストエフォート: unload 中は非同期処理の完了を保証できないため fire-and-forget。
      void generateAndUploadThumbnail(pixiApp, mapId);
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribeObjects();
      unsubscribeLayers();
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [mapId, mapDoc, pixiApp]);

  return (
    <div className="flex h-screen flex-col bg-neutral-100">
      <TopBar mapName={mapName} backHref={backHref} mapId={mapId} mapDoc={mapDoc} pixiApp={pixiApp} />
      <div className="flex flex-1 overflow-hidden">
        <ToolBar />
        {tool === "draw" && (
          <div className="w-56 shrink-0 overflow-y-auto border-r border-neutral-200 bg-white">
            <CatalogPanel />
          </div>
        )}
        <PixiCanvas mapDoc={mapDoc} initialScale={initialScale} onAppChange={setPixiApp} />
        <div className="flex w-[280px] shrink-0 flex-col border-l border-neutral-200 bg-white">
          <div className="max-h-[50%] overflow-y-auto border-b border-neutral-200">
            <PropertiesPanel mapDoc={mapDoc} />
          </div>
          <div className="flex-1 overflow-hidden">
            <LayerPanel mapDoc={mapDoc} />
          </div>
        </div>
      </div>
      <StatusBar />
    </div>
  );
}
