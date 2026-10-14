// テキスト・ラベル系レンダラ共通のフォント／白縁取りスタイル（実装書 §3.5・§M6-1）。
// Noto Sans JP（Google Fonts 名）を第一候補に、OS にプリインストールされがちな
// Noto Sans CJK JP（Linux ディストリのパッケージ名。開発VMもこちら）を次点、
// 最後に system-ui/sans-serif へフォールバックする（日本語グリフを優先しつつ
// 未導入環境でも文字化けしない）。
export const LABEL_FONT_FAMILY = '"Noto Sans JP", "Noto Sans CJK JP", system-ui, sans-serif';

export function haloTextStyle(fontSize: number, color: string) {
  return {
    fontFamily: LABEL_FONT_FAMILY,
    fontSize,
    fill: color,
    stroke: { color: 0xffffff, width: fontSize * 0.15 },
    align: "center" as const,
  };
}
