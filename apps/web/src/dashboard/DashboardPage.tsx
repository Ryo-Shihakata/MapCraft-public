// マップ一覧ダッシュボード（§M2-5・§M9-4）。カード型グリッド・新規作成・インライン改名・削除・
// .fmap インポート。
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { parseFmap, type MapMeta } from "@mapcraft/shared";
import { api, ApiError } from "../lib/api.js";
import { authClient } from "../auth/authClient.js";
import { useSession } from "../auth/useSession.js";
import { setPendingImport } from "../lib/importStaging.js";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const [mapList, setMapList] = useState<MapMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      setMapList(await api.listMaps());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "マップ一覧の取得に失敗しました");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (renamingId) renameInputRef.current?.select();
  }, [renamingId]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const created = await api.createMap();
      navigate(`/edit/${created.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "マップの作成に失敗しました");
      setCreating(false);
    }
  };

  const startRename = (map: MapMeta) => {
    setRenamingId(map.id);
    setRenameDraft(map.name);
  };

  const commitRename = async () => {
    if (!renamingId) return;
    const id = renamingId;
    const name = renameDraft.trim();
    setRenamingId(null);
    const current = mapList?.find((m) => m.id === id);
    if (!name || !current || name === current.name) return;
    try {
      const updated = await api.renameMap(id, name);
      setMapList((list) => list?.map((m) => (m.id === id ? updated : m)) ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "名前の変更に失敗しました");
    }
  };

  const handleDelete = async (map: MapMeta) => {
    if (!window.confirm(`「${map.name}」を削除しますか？この操作は取り消せません。`)) return;
    try {
      await api.deleteMap(map.id);
      setMapList((list) => list?.filter((m) => m.id !== map.id) ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "削除に失敗しました");
    }
  };

  const handleSignOut = async () => {
    await authClient.signOut();
    navigate("/login");
  };

  // .fmap インポート（§M9-4）: parseFmap で検証 → 空の新規マップを作成 → sessionStorage に
  // 一時保管 → /edit/:id へ遷移。EditorPage の初回 sync 完了後に applyFmapImport が適用する。
  const handleImportFile = async (file: File) => {
    setImporting(true);
    setError(null);
    try {
      const text = await file.text();
      let parsed;
      try {
        parsed = parseFmap(text);
      } catch (e) {
        const reason = e instanceof Error ? e.message : "不明なエラー";
        setError(`${file.name} の読み込みに失敗しました: ${reason}`);
        return;
      }
      const created = await api.createMap(parsed.name);
      setPendingImport(created.id, parsed);
      navigate(`/edit/${created.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "インポートに失敗しました");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <h1 className="text-lg font-bold text-neutral-800">MapCraft</h1>
          <div className="flex items-center gap-3">
            {session?.user && (
              <span className="text-sm text-neutral-500">{session.user.name}</span>
            )}
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="rounded-md px-2 py-1 text-sm text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
            >
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-neutral-800">マイマップ</h2>
          <div className="flex items-center gap-2">
            <input
              ref={importInputRef}
              type="file"
              accept=".fmap,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void handleImportFile(file);
              }}
            />
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              disabled={importing}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50 disabled:opacity-50"
            >
              {importing ? "インポート中…" : ".fmap をインポート"}
            </button>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating}
              className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
            >
              {creating ? "作成中…" : "＋ 新しい地図"}
            </button>
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {mapList === null ? (
          <p className="mt-12 text-center text-neutral-500">読み込み中…</p>
        ) : mapList.length === 0 ? (
          <div className="mt-16 text-center">
            <p className="text-neutral-600">まだ地図がありません。</p>
            <p className="mt-1 text-sm text-neutral-500">
              「＋ 新しい地図」から最初の架空地図を作りましょう。
            </p>
          </div>
        ) : (
          <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mapList.map((map) => (
              <li
                key={map.id}
                className="group overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                <button
                  type="button"
                  onClick={() => navigate(`/edit/${map.id}`)}
                  className="block h-32 w-full bg-neutral-200"
                  aria-label={`${map.name} を開く`}
                >
                  {map.thumbnailUrl ? (
                    <img
                      src={map.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center text-3xl text-neutral-400">
                      🗺
                    </span>
                  )}
                </button>
                <div className="px-4 py-3">
                  {renamingId === map.id ? (
                    <input
                      ref={renameInputRef}
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={() => void commitRename()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void commitRename();
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="w-full rounded border border-neutral-300 px-2 py-1 text-sm font-medium text-neutral-800 outline-none focus:border-neutral-500"
                    />
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onDoubleClick={() => startRename(map)}
                        onClick={() => navigate(`/edit/${map.id}`)}
                        className="truncate text-left text-sm font-medium text-neutral-800"
                        title={`${map.name}（ダブルクリックで改名）`}
                      >
                        {map.name}
                      </button>
                      <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => startRename(map)}
                          className="rounded p-1 text-xs text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                          title="名前を変更"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(map)}
                          className="rounded p-1 text-xs text-neutral-400 hover:bg-red-50 hover:text-red-600"
                          title="削除"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  )}
                  <p className="mt-1 text-xs text-neutral-500">
                    更新: {formatDate(map.updatedAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
