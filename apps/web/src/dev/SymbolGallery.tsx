// 記号ギャラリー（開発専用。ルート /dev/symbols、import.meta.env.DEV のみ）。
// M1 の逸脱（docs/v2-decisions.md 2026-07-04 M1 エントリ）で先送りされていた配線を M3 で行う。
// SYMBOL_PATHS（42記号＋パターングリフ8種＝50）を SVG インライン表示で目視確認する。
import { SYMBOL_PATHS } from "@mapcraft/shared";

export function SymbolGallery() {
  const entries = Object.entries(SYMBOL_PATHS).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <h1 className="mb-1 text-lg font-bold text-neutral-800">記号ギャラリー（開発用）</h1>
      <p className="mb-4 text-sm text-neutral-500">SYMBOL_PATHS 全 {entries.length} 種（42記号＋パターングリフ8種）</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {entries.map(([key, def]) => (
          <div
            key={key}
            className="flex flex-col items-center gap-1 rounded-lg border border-neutral-200 bg-white p-3"
          >
            <svg viewBox="0 0 24 24" width={56} height={56}>
              <rect x={0} y={0} width={24} height={24} fill="#fafafa" />
              <path
                d={def.d}
                fill={def.strokeOnly ? "none" : "#222222"}
                fillRule="evenodd"
                stroke={def.strokeOnly ? "#222222" : "none"}
                strokeWidth={def.strokeOnly ? 1.6 : 0}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="break-all text-center text-[10px] text-neutral-500">{key}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
