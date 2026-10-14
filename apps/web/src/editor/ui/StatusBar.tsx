// StatusBar（実装書 §3.9）: 座標(m) / 縮尺(1:n) / スナップ状態トグル。
// statusMessage（レイヤーロック中の描画拒否など）が設定されている間は座標表示を
// 一時的に置き換え、数秒後に自動で消える（実装書 §M4-3）。
import { useEffect } from "react";
import { scaleToRatio } from "@mapcraft/shared";
import { useUIStore } from "../state/uiStore.js";
import { useViewStore } from "../state/viewStore.js";

const STATUS_MESSAGE_TIMEOUT_MS = 3500;

export function StatusBar() {
  const vt = useViewStore((s) => s.vt);
  const cursorWorld = useUIStore((s) => s.cursorWorld);
  const snapConfig = useUIStore((s) => s.snapConfig);
  const setSnapConfig = useUIStore((s) => s.setSnapConfig);
  const statusMessage = useUIStore((s) => s.statusMessage);
  const setStatusMessage = useUIStore((s) => s.setStatusMessage);

  useEffect(() => {
    if (!statusMessage) return;
    const id = window.setTimeout(() => setStatusMessage(null), STATUS_MESSAGE_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [statusMessage, setStatusMessage]);

  const snapBtn = (key: "vertex" | "grid" | "angle", label: string) => (
    <button
      type="button"
      onClick={() => setSnapConfig({ [key]: !snapConfig[key] })}
      className={`rounded px-1.5 py-0.5 ${
        snapConfig[key] ? "bg-neutral-200 text-neutral-800" : "text-neutral-300"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-6 shrink-0 items-center gap-3 border-t border-neutral-200 bg-white px-3 text-[11px] text-neutral-500 select-none">
      {statusMessage ? (
        <span className="font-medium text-red-600">{statusMessage}</span>
      ) : (
        <span>{cursorWorld ? `X: ${cursorWorld.x.toFixed(1)}m, Y: ${cursorWorld.y.toFixed(1)}m` : "—"}</span>
      )}
      <span>{scaleToRatio(vt.s)}</span>
      <div className="flex-1" />
      {snapBtn("vertex", "頂点")}
      {snapBtn("grid", "グリッド")}
      {snapBtn("angle", "角度")}
    </div>
  );
}
