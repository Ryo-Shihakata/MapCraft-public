// CatalogPanel（実装書 §3.9・§M4-2）: 11カテゴリのアコーディオン＋テキスト検索。
// 項目クリックで tool="draw" + activeItemId を設定する。ミニプレビューは
// point は SYMBOL_PATHS の SVG、line/area/rect は style 色のスウォッチ/線見本。
import { useMemo, useState } from "react";
import type { CatalogItem } from "@mapcraft/shared";
import { CATALOG, CATEGORIES, SYMBOL_PATHS, getCatalogByCategory } from "@mapcraft/shared";
import { useUIStore } from "../state/uiStore.js";

function ItemPreview({ item }: { item: CatalogItem }) {
  const { style, geom } = item;

  if (geom === "point" && style.sym) {
    const def = SYMBOL_PATHS[style.sym];
    if (def) {
      return (
        <svg width={18} height={18} viewBox="0 0 24 24" className="shrink-0">
          {def.strokeOnly ? (
            <path
              d={def.d}
              fill="none"
              stroke={style.color ?? "#000000"}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <path d={def.d} fill={style.color ?? "#000000"} fillRule="evenodd" />
          )}
        </svg>
      );
    }
  }

  if (geom === "line") {
    return (
      <svg width={26} height={14} viewBox="0 0 26 14" className="shrink-0">
        <line
          x1={2}
          y1={7}
          x2={24}
          y2={7}
          stroke={style.stroke ?? "#000000"}
          strokeWidth={Math.min(6, Math.max(2, (style.w ?? 2) / 2))}
          strokeDasharray={style.dash ? style.dash.join(",") : undefined}
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // area / admin / rect: 色スウォッチ
  return (
    <span
      className="inline-block h-3.5 w-6 shrink-0 rounded-sm border"
      style={{ backgroundColor: style.fill ?? "#eeeeee", borderColor: style.stroke ?? "#999999" }}
    />
  );
}

function ItemButton({ item }: { item: CatalogItem }) {
  const activeItemId = useUIStore((s) => s.activeItemId);
  const setActiveItemId = useUIStore((s) => s.setActiveItemId);
  const setTool = useUIStore((s) => s.setTool);

  const active = activeItemId === item.id;

  return (
    <button
      type="button"
      onClick={() => {
        setActiveItemId(item.id);
        setTool("draw");
      }}
      aria-pressed={active}
      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
        active ? "bg-neutral-800 text-white" : "text-neutral-700 hover:bg-neutral-100"
      }`}
    >
      <ItemPreview item={item} />
      <span className="truncate">{item.name}</span>
    </button>
  );
}

export function CatalogPanel() {
  const [query, setQuery] = useState("");
  const [openCats, setOpenCats] = useState<Set<string>>(() => new Set(CATEGORIES));

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return null;
    return CATALOG.filter((c) => c.name.includes(q));
  }, [query]);

  const toggleCat = (cat: string) =>
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-200 p-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="カタログを検索..."
          className="w-full rounded border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-neutral-500"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered ? (
          <div className="flex flex-col gap-0.5 p-2">
            {filtered.length === 0 ? (
              <p className="p-2 text-xs text-neutral-400">該当する項目がありません</p>
            ) : (
              filtered.map((item) => <ItemButton key={item.id} item={item} />)
            )}
          </div>
        ) : (
          CATEGORIES.map((cat) => (
            <div key={cat} className="border-b border-neutral-100">
              <button
                type="button"
                onClick={() => toggleCat(cat)}
                className="flex w-full items-center justify-between px-2 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
              >
                <span>{cat}</span>
                <span className="text-neutral-400">{openCats.has(cat) ? "▾" : "▸"}</span>
              </button>
              {openCats.has(cat) && (
                <div className="flex flex-col gap-0.5 px-1 pb-2">
                  {getCatalogByCategory(cat).map((item) => (
                    <ItemButton key={item.id} item={item} />
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
