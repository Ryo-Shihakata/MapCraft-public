// ファイル名生成（実装書 §M9-1）。マップ名 + 拡張子。禁則文字（Windows/主要OSで
// パス区切り・予約文字となるもの）は "_" に置換し、前後の空白・ドットを除去する。
const FORBIDDEN_CHARS = /[\\/:*?"<>|]/g;

export function sanitizeFilename(name: string): string {
  const cleaned = name.replace(FORBIDDEN_CHARS, "_").trim().replace(/\.+$/, "");
  return cleaned.length > 0 ? cleaned : "map";
}

export function buildExportFilename(mapName: string, ext: string): string {
  return `${sanitizeFilename(mapName)}.${ext}`;
}

// data URL / Blob をブラウザにダウンロードさせる共通ヘルパー（PNG/SVG/.fmap 共通）。
export function triggerDownload(href: string, filename: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function downloadTextFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  try {
    triggerDownload(url, filename);
  } finally {
    // ダウンロード起動は同期処理のため、次のマイクロタスクで安全に revoke できる。
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
