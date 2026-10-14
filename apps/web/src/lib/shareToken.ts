// 共有リンク経由で参加した際の token を sessionStorage に保持する（§M8-4）。
// `/s/:token` で GET /api/share/:token に成功したら {mapId: token} を保存して `/edit/:mapId`
// へ遷移する。EditorPage はここから読み出し、メタ取得（?t=）と WS 接続に付与する。
const STORAGE_KEY = "mapcraft:shareTokens";

function readAll(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, string>;
    return {};
  } catch {
    return {};
  }
}

export function setShareToken(mapId: string, token: string): void {
  const all = readAll();
  all[mapId] = token;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // sessionStorage が使えない環境（プライベートモード等）では黙って諦める。
  }
}

export function getShareToken(mapId: string): string | undefined {
  return readAll()[mapId];
}
