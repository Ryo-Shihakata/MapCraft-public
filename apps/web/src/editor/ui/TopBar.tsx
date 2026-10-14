// TopBar（実装書 §3.9・§M7-4/6・§M8-3・§M9-1）: マップ名表示・戻るリンク・接続状態・
// プレゼンスアバター列・共有ボタン（オーナーのみ）・エクスポート。
import { useState } from "react";
import { Link } from "react-router";
import type { PixiApp } from "../canvas/PixiApp.js";
import type { MapDoc } from "../doc/MapDoc.js";
import { useUIStore } from "../state/uiStore.js";
import { ExportDialog } from "./ExportDialog.js";
import { ShareDialog } from "./ShareDialog.js";

interface TopBarProps {
  mapName: string;
  backHref: string;
  // サーバー同期マップの id。未指定（/dev/editor 等）または role !== owner のときは
  // 共有ボタン自体を表示しない（§M8-3: 「オーナー以外にはダイアログ自体を出さない」）。
  mapId?: string | undefined;
  // M9: エクスポート（ExportDialog）が地図データ・Pixi 描画を必要とするため受け取る。
  // pixiApp は PixiCanvas の初期化完了まで null（読み込み中は ExportDialog 側でガードする）。
  mapDoc: MapDoc;
  pixiApp: PixiApp | null;
}

const STATUS_LABEL: Record<"connecting" | "connected" | "offline", string> = {
  connected: "同期済み",
  connecting: "同期中…",
  offline: "オフライン",
};

const STATUS_DOT_CLASS: Record<"connecting" | "connected" | "offline", string> = {
  connected: "bg-emerald-500",
  connecting: "bg-amber-500",
  offline: "bg-red-500",
};

function initials(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

export function TopBar({ mapName, backHref, mapId, mapDoc, pixiApp }: TopBarProps) {
  const connectionStatus = useUIStore((s) => s.connectionStatus);
  const remoteAwareness = useUIStore((s) => s.remoteAwareness);
  const role = useUIStore((s) => s.role);
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const canShare = role === "owner" && mapId !== undefined;

  return (
    <div className="flex h-11 shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-3 select-none">
      <Link to={backHref} className="text-sm text-neutral-500 transition-colors hover:text-neutral-800">
        ← 戻る
      </Link>
      <div className="h-5 w-px bg-neutral-200" />
      <span className="text-sm font-medium text-neutral-800">MapCraft</span>
      <span className="truncate text-sm text-neutral-400">{mapName}</span>

      {role === "view" && (
        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-500">閲覧専用</span>
      )}

      <div className="ml-auto flex items-center gap-3">
        <button
          type="button"
          onClick={() => setExportOpen(true)}
          className="rounded border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
        >
          エクスポート ▾
        </button>

        {canShare && (
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="rounded border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
          >
            共有
          </button>
        )}

        {remoteAwareness.length > 0 && (
          <div className="flex -space-x-2">
            {remoteAwareness.map((entry) => (
              <div
                key={entry.clientId}
                title={entry.state.user.name}
                className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[10px] font-semibold text-white shadow-sm"
                style={{ backgroundColor: entry.state.user.color }}
              >
                {initials(entry.state.user.name)}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1.5 text-xs text-neutral-500">
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT_CLASS[connectionStatus]}`} />
          <span>{STATUS_LABEL[connectionStatus]}</span>
        </div>

        {(connectionStatus === "connecting" || connectionStatus === "offline") && (
          <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">再接続中…</span>
        )}
      </div>

      {shareOpen && canShare && <ShareDialog mapId={mapId} onClose={() => setShareOpen(false)} />}
      {exportOpen && (
        <ExportDialog mapDoc={mapDoc} mapName={mapName} pixiApp={pixiApp} onClose={() => setExportOpen(false)} />
      )}
    </div>
  );
}
