// PixiApp を React にマウントするコンポーネント（実装書 §3.1・§3.6・§M4-1）。
// StrictMode の mount→unmount→mount 二重実行に対応するため、PixiApp.create の
// 非同期完了を cancelled フラグで待ち受け、キャンセルされていたら即 destroy する。
// ポインタ/キーボード処理（パン・描画・カーソル追跡・Undo/Redo 等）は ToolManager に
// 委譲する（実装書 §M4-1: 「PixiCanvas に既にあるポインタ処理を ToolManager へ整理統合」）。
// ホイールズームのみ view 操作として本コンポーネントに残す。
import { useEffect, useRef } from "react";
import { CATALOG_BY_ID } from "@mapcraft/shared";
import { PixiApp } from "../canvas/PixiApp.js";
import type { MapDoc } from "../doc/MapDoc.js";
import { ToolManager } from "../tools/ToolManager.js";
import { useUIStore } from "../state/uiStore.js";
import { S_MAX, S_MIN, useViewStore } from "../state/viewStore.js";
import { TextEditOverlay } from "./TextEditOverlay.js";

interface PixiCanvasProps {
  mapDoc: MapDoc;
  initialScale?: number | undefined;
  // M9: エクスポート（ExportDialog・サムネイル生成）が PixiApp インスタンスを必要とするため、
  // 生成/破棄のタイミングで親（EditorLayout）へ通知する。
  onAppChange?: ((app: PixiApp | null) => void) | undefined;
}

export function PixiCanvas({ mapDoc, initialScale, onAppChange }: PixiCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tool = useUIStore((s) => s.tool);

  // PixiApp・ToolManager の生成・破棄。ToolManager は PixiApp の初期化完了後に
  // 生成する（描画プレビュー・スナップインジケータの更新コールバックが app を必要とするため）。
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let createdApp: PixiApp | null = null;
    let createdToolManager: ToolManager | null = null;
    let unsubscribeRemoteAwareness: (() => void) | null = null;

    const rect = container.getBoundingClientRect();
    const width = rect.width || 1400;
    const height = rect.height || 900;
    useViewStore.getState().reset(width, height, 0.1);
    if (initialScale !== undefined && Number.isFinite(initialScale)) {
      const clamped = Math.max(S_MIN, Math.min(S_MAX, initialScale));
      const { vt } = useViewStore.getState();
      useViewStore.getState().setVt({ ...vt, s: clamped });
    }

    void PixiApp.create(
      container,
      mapDoc,
      CATALOG_BY_ID,
      () => useViewStore.getState().vt,
      (cb) => useViewStore.subscribe((state, prevState) => cb(state.vt, prevState.vt))
    ).then((app) => {
      if (cancelled) {
        app.destroy();
        return;
      }
      createdApp = app;
      createdToolManager = new ToolManager(container, mapDoc, {
        onDrawPreview: (drawing, item, cursor) => app.setDrawPreview(drawing, item, cursor),
        onSnapIndicator: (snap) => app.setSnapIndicator(snap),
        onSelectionOverlay: (state) => app.setSelectionOverlay(state),
      });

      // M7: リモートカーソル・リモート選択（awareness）を overlay へ反映する。
      app.setRemoteAwareness(useUIStore.getState().remoteAwareness);
      unsubscribeRemoteAwareness = useUIStore.subscribe((state, prev) => {
        if (state.remoteAwareness !== prev.remoteAwareness) app.setRemoteAwareness(state.remoteAwareness);
      });

      onAppChange?.(app);
    });

    return () => {
      cancelled = true;
      unsubscribeRemoteAwareness?.();
      createdToolManager?.destroy();
      createdApp?.destroy();
      if (createdApp) onAppChange?.(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onAppChange は毎レンダー新しい関数参照になりうるため依存から除外（呼び出し元は useCallback 相当のことを気にしない薄い通知用途）
  }, [mapDoc, initialScale]);

  // ホイールズーム（カーソル位置を不動点に）。view 操作なので ToolManager の対象外。
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const factor = 1.0015 ** -e.deltaY;
      useViewStore.getState().zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, []);

  const cursor = tool === "draw" ? "crosshair" : tool === "text" ? "text" : tool === "pan" ? "grab" : "default";

  return (
    <div
      ref={containerRef}
      data-testid="pixi-canvas"
      className="relative flex-1 overflow-hidden bg-[#f7f5f0]"
      style={{ cursor }}
    >
      <TextEditOverlay mapDoc={mapDoc} />
    </div>
  );
}
