// キーボードショートカット一元定義（実装書 §3.9）。ToolManager がここの定義に従って
// dispatch する。ヘルプモーダル（`?`）表示は将来のM対応だが、一覧はここに置いておく。
export interface ShortcutEntry {
  keys: string;
  label: string;
}

export const SHORTCUTS: ShortcutEntry[] = [
  { keys: "V", label: "選択ツール" },
  { keys: "P", label: "描画ツール" },
  { keys: "T", label: "テキストツール" },
  { keys: "H", label: "パンツール" },
  { keys: "Space（押下中）", label: "一時パン" },
  { keys: "Tab", label: "直線/曲線切替（描画中）" },
  { keys: "Enter / ダブルクリック", label: "確定" },
  { keys: "Esc", label: "キャンセル / 選択解除" },
  { keys: "Del", label: "削除" },
  { keys: "Ctrl+Z", label: "Undo" },
  { keys: "Ctrl+Shift+Z", label: "Redo" },
  { keys: "Ctrl+C / X / V", label: "コピー / カット / ペースト" },
  { keys: "Ctrl+D", label: "複製" },
  { keys: "矢印キー", label: "ナッジ（グリッド1間隔、Shiftで×10）" },
  { keys: "Ctrl+0", label: "全体表示" },
  { keys: "Ctrl+= / Ctrl+-", label: "ズーム" },
];

// テキスト入力中はショートカットを無効化する（PropertiesPanel の入力欄フォーカス中など）。
export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

// ツール切替キー（V/P/T/H）。
export const TOOL_KEYS: Record<string, "select" | "draw" | "text" | "pan"> = {
  v: "select",
  p: "draw",
  t: "text",
  h: "pan",
};
