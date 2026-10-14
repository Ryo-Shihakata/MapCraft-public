// .fmap インポートの一時保管（実装書 §M9-4）。Dashboard で解析済みの FmapFile を
// sessionStorage に置き、遷移先の /edit/:id（新規作成したマップ）が初回 sync 完了後に
// 読み出して適用する（apps/web/src/lib/shareToken.ts と同じ「sessionStorage 経由で
// ページ遷移をまたぐ」パターン）。
import type { FmapFile } from "@mapcraft/shared";

const STORAGE_KEY = "mapcraft:pendingImports";

function readAll(): Record<string, FmapFile> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, FmapFile>;
    return {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, FmapFile>): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // sessionStorage が使えない環境（プライベートモード等）では黙って諦める。
  }
}

export function setPendingImport(mapId: string, file: FmapFile): void {
  const all = readAll();
  all[mapId] = file;
  writeAll(all);
}

// 取り出すと同時にストレージから削除する（一度きりの適用。再読み込みでの二重適用を防ぐ）。
export function takePendingImport(mapId: string): FmapFile | undefined {
  const all = readAll();
  const file = all[mapId];
  if (file) {
    delete all[mapId];
    writeAll(all);
  }
  return file;
}
