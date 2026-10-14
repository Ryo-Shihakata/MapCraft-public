// ExportDialog（実装書 §M9-1）: TopBar「エクスポート ▾」から開く。
// 形式（PNG/SVG/.fmap）・範囲（現在のビュー/全オブジェクト+余白5%）・PNG のみ倍率を選ぶ。
// ShareDialog（../ui/ShareDialog.tsx）と同じモーダルの見た目・操作規約に合わせる。
import { useState } from "react";
import type { PixiApp } from "../canvas/PixiApp.js";
import type { MapDoc } from "../doc/MapDoc.js";
import { exportFmap } from "../../export/exportFmap.js";
import { clampPngPxPerMeter, exportPng, type PngMultiplier } from "../../export/exportPng.js";
import { resolveExportBBox, type ExportRangeMode } from "../../export/exportRange.js";
import { exportSvgFile } from "../../export/exportSvgFile.js";
import { useViewStore } from "../state/viewStore.js";

interface ExportDialogProps {
  mapDoc: MapDoc;
  mapName: string;
  pixiApp: PixiApp | null;
  onClose: () => void;
}

type ExportFormat = "png" | "svg" | "fmap";

const FORMAT_LABEL: Record<ExportFormat, string> = { png: "PNG", svg: "SVG", fmap: ".fmap" };
const FORMATS: ExportFormat[] = ["png", "svg", "fmap"];
const RANGE_LABEL: Record<ExportRangeMode, string> = { view: "現在のビュー", all: "全オブジェクト（+余白5%）" };
const RANGES: ExportRangeMode[] = ["view", "all"];
const MULTIPLIERS: PngMultiplier[] = [1, 2, 4];

export function ExportDialog({ mapDoc, mapName, pixiApp, onClose }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>("png");
  const [range, setRange] = useState<ExportRangeMode>("view");
  const [multiplier, setMultiplier] = useState<PngMultiplier>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsPixiApp = format === "png" || format === "svg";

  const handleExport = async () => {
    setError(null);

    if (format === "fmap") {
      exportFmap(mapDoc, mapName);
      onClose();
      return;
    }

    if (!pixiApp) {
      setError("キャンバスの準備中です。しばらく待ってから再試行してください。");
      return;
    }

    const bbox = resolveExportBBox(pixiApp, range);
    if (!bbox) {
      setError("オブジェクトがありません。「現在のビュー」を選ぶか、地図を描いてから再試行してください。");
      return;
    }

    setBusy(true);
    try {
      const baseScale = useViewStore.getState().vt.s;
      if (format === "png") {
        const pxPerMeter = clampPngPxPerMeter(bbox, baseScale, multiplier);
        await exportPng(pixiApp, bbox, pxPerMeter, mapName);
      } else {
        exportSvgFile(mapDoc, mapName, bbox, baseScale);
      }
      onClose();
    } catch {
      setError("エクスポートに失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-[380px] rounded-lg bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="エクスポート"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-800">エクスポート</h2>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
            ✕
          </button>
        </div>

        <div className="mb-3">
          <p className="mb-1.5 text-xs font-medium text-neutral-600">形式</p>
          <div className="flex gap-1.5">
            {FORMATS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                className={`flex-1 rounded border px-2 py-1.5 text-xs font-medium transition-colors ${
                  format === f
                    ? "border-neutral-800 bg-neutral-800 text-white"
                    : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                {FORMAT_LABEL[f]}
              </button>
            ))}
          </div>
        </div>

        {needsPixiApp && (
          <div className="mb-3">
            <p className="mb-1.5 text-xs font-medium text-neutral-600">範囲</p>
            <div className="flex gap-1.5">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={`flex-1 rounded border px-2 py-1.5 text-xs font-medium transition-colors ${
                    range === r
                      ? "border-neutral-800 bg-neutral-800 text-white"
                      : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  {RANGE_LABEL[r]}
                </button>
              ))}
            </div>
          </div>
        )}

        {format === "png" && (
          <div className="mb-3">
            <p className="mb-1.5 text-xs font-medium text-neutral-600">倍率</p>
            <div className="flex gap-1.5">
              {MULTIPLIERS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMultiplier(m)}
                  className={`flex-1 rounded border px-2 py-1.5 text-xs font-medium transition-colors ${
                    multiplier === m
                      ? "border-neutral-800 bg-neutral-800 text-white"
                      : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  {m}x
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={busy}
          className="w-full rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
        >
          {busy ? "書き出し中…" : "ダウンロード"}
        </button>
      </div>
    </div>
  );
}
