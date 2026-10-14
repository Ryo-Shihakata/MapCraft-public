// ToolBar（実装書 §3.9・§M8-5）: ツール切替のみ（描画・選択の実挙動は M4/M5）。左端・幅48px。
// role=view のときは「選択」のみ表示する（実装書 §M8-5: 「ToolBar は選択ツールのみ」。
// パン・ズームなどのビュー操作はツール切替とは独立に space/中ボタン/ホイールで常に可能なため、
// ここで隠しても閲覧体験は損なわれない）。
import { useUIStore, type Tool } from "../state/uiStore.js";

const TOOLS: Array<{ id: Tool; label: string; glyph: string; key: string }> = [
  { id: "select", label: "選択", glyph: "▶", key: "V" },
  { id: "draw", label: "描画", glyph: "✎", key: "P" },
  { id: "text", label: "文字", glyph: "T", key: "T" },
  { id: "pan", label: "パン", glyph: "✋", key: "H" },
];

export function ToolBar() {
  const tool = useUIStore((s) => s.tool);
  const setTool = useUIStore((s) => s.setTool);
  const role = useUIStore((s) => s.role);
  const tools = role === "view" ? TOOLS.filter((t) => t.id === "select") : TOOLS;

  return (
    <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-neutral-200 bg-white py-2">
      {tools.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setTool(t.id)}
          title={`${t.label} (${t.key})`}
          aria-pressed={tool === t.id}
          className={`flex h-9 w-9 items-center justify-center rounded text-sm transition-colors ${
            tool === t.id
              ? "bg-neutral-800 text-white"
              : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
          }`}
        >
          {t.glyph}
        </button>
      ))}
    </div>
  );
}
