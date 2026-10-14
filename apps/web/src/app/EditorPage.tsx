// エディタページ（実装書 §M3-1・§M3-6・§M7-3）。
//
// /edit/:mapId（サーバー同期）と /dev/editor（ローカルのみ・provider 無し）で
// 挙動が分かれる。M3〜M6 のコードは WS の存在を知らない設計（§4.1）を維持するため、
// provider の有無に関わらず MapDoc・EditorLayout 以下は同一のまま使う。
//
// MapDoc は plain な JS オブジェクトグラフ（外部リソースを保持しない）なので、
// StrictMode の mount→unmount→mount 二重実行下で ref による遅延生成 + 明示的 destroy
// を組み合わせると「破棄済みの MapDoc を参照し続ける」問題が起きる（PixiApp の
// WebGL context のような真に破棄が必要な外部リソースとは性質が異なる）。
// そのためここでは ref 一回限りの生成のみ行い、アンマウント時の明示的 destroy は
// 行わない（GC に委ねる）。
//
// 一方 MapProvider は WebSocket という真の外部リソースを持つため、PixiApp と同様に
// useEffect + cancelled フラグ + 確実な destroy で StrictMode の二重実行に対応する
// （MapDoc 自体は ref で維持されたまま、provider だけ作り直される）。
import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import type { MapMeta } from "@mapcraft/shared";
import { EditorLayout } from "../editor/ui/EditorLayout.js";
import { applyFmapImport } from "../editor/doc/applyFmap.js";
import { colorForUser } from "../editor/doc/awareness.js";
import { MapDoc } from "../editor/doc/MapDoc.js";
import { buildWsUrl, MapProvider } from "../editor/doc/provider.js";
import { seedDemoObjects, seedLocalDefaults, seedPerfObjects } from "../editor/doc/seed.js";
import { useUIStore } from "../editor/state/uiStore.js";
import { api, ApiError } from "../lib/api.js";
import { takePendingImport } from "../lib/importStaging.js";
import { getShareToken } from "../lib/shareToken.js";

const CURSOR_SEND_THROTTLE_MS = 50;

function useMapDoc(): MapDoc {
  const ref = useRef<MapDoc | null>(null);
  if (!ref.current) ref.current = new MapDoc();
  return ref.current;
}

// ローカル専用ルート（/dev/editor）。provider を繋がずローカル Y.Doc のみで完結する
// （実装書 §M7-3: 「/dev/editor は従来どおりローカルのみで維持」）。
function LocalEditor({ mapId, initialScale }: { mapId: string; initialScale: number | undefined }) {
  const [searchParams] = useSearchParams();
  const seedParam = searchParams.get("seed");
  const mapDoc = useMapDoc();

  const seededRef = useRef(false);
  if (!seededRef.current) {
    seedLocalDefaults(mapDoc);
    if (seedParam === "demo") seedDemoObjects(mapDoc);
    // M10-2: `?seed=perf` で 5,000 オブジェクトの性能検証用シードを投入する。
    if (seedParam === "perf") seedPerfObjects(mapDoc);
    seededRef.current = true;
  }

  return (
    <EditorLayout mapDoc={mapDoc} mapName={`ローカル編集: ${mapId}`} backHref="/dashboard" initialScale={initialScale} />
  );
}

type ServerState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; meta: MapMeta };

// サーバー同期ルート（/edit/:mapId）。GET /api/maps/:id → MapDoc → provider 接続
// → 初回 sync 完了までローディング（実装書 §M7-3）。
function ServerEditor({ mapId, initialScale }: { mapId: string; initialScale: number | undefined }) {
  const mapDoc = useMapDoc();
  const [state, setState] = useState<ServerState>({ kind: "loading" });
  const [synced, setSynced] = useState(false);
  const providerRef = useRef<MapProvider | null>(null);

  // メタデータ取得（403/404 → エラーページ。§M7-3）。role は uiStore へ即反映し、
  // ToolManager の readonly ガード（§M7-5）へ伝える。共有リンク経由（/s/:token）の参加は
  // sessionStorage に保存された token を ?t= として付与する（§M8-4）。
  const shareToken = getShareToken(mapId);
  useEffect(() => {
    let cancelled = false;
    setSynced(false);
    setState({ kind: "loading" });
    api
      .getMap(mapId, shareToken)
      .then((meta) => {
        if (cancelled) return;
        useUIStore.getState().setRole(meta.myRole);
        setState({ kind: "ready", meta });
      })
      .catch((e) => {
        if (cancelled) return;
        const message = e instanceof ApiError ? e.message : "マップの取得に失敗しました";
        setState({ kind: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [mapId, shareToken]);

  // provider の接続。meta 取得成功後にのみ張る（役割が確定してから同期する）。
  useEffect(() => {
    if (state.kind !== "ready") return;
    let cancelled = false;

    const provider = new MapProvider(mapDoc, buildWsUrl(mapId, shareToken), {
      onStatusChange: (status) => useUIStore.getState().setConnectionStatus(status),
      onSynced: () => {
        if (!cancelled) setSynced(true);
      },
      onRemoteAwarenessChange: (entries) => useUIStore.getState().setRemoteAwareness(entries),
    });
    providerRef.current = provider;

    void api.me().then((me) => {
      if (cancelled) return;
      provider.setLocalUser({ id: me.id, name: me.name, color: colorForUser(me.id) });
    });

    return () => {
      cancelled = true;
      providerRef.current = null;
      provider.destroy();
      useUIStore.getState().setConnectionStatus("connected");
      useUIStore.getState().setRemoteAwareness([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mapDoc は ref で不変、state.kind の遷移のみ追跡する
  }, [state.kind === "ready", mapId, shareToken]);

  // .fmap インポートの適用（§M9-4）: sessionStorage に一時保管された FmapFile があれば、
  // 初回 sync 完了直後に1回だけ適用する（Dashboard の「.fmap をインポート」から遷移した
  // 直後の空マップにのみ存在する）。takePendingImport は取得と同時に削除するため、
  // 再レンダーや再接続で複数回発火しても実害はない（2回目以降は何も見つからない）。
  useEffect(() => {
    if (!synced) return;
    const pending = takePendingImport(mapId);
    if (pending) applyFmapImport(mapDoc, pending);
  }, [synced, mapId, mapDoc]);

  // ローカルの cursorWorld / selectedIds を awareness へ反映する（実装書 §4.4）。
  // cursor は高頻度で変化するため CURSOR_SEND_THROTTLE_MS で間引く。
  useEffect(() => {
    if (state.kind !== "ready") return;
    let lastSentAt = 0;
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;

    const flushCursor = (cursor: { x: number; y: number } | null) => {
      providerRef.current?.setLocalCursor(cursor);
      lastSentAt = Date.now();
    };

    const unsubscribe = useUIStore.subscribe((s, prev) => {
      if (s.selectedIds !== prev.selectedIds) {
        providerRef.current?.setLocalSelection(s.selectedIds);
      }
      if (s.cursorWorld !== prev.cursorWorld) {
        const now = Date.now();
        const elapsed = now - lastSentAt;
        if (elapsed >= CURSOR_SEND_THROTTLE_MS) {
          if (pendingTimer) {
            clearTimeout(pendingTimer);
            pendingTimer = null;
          }
          flushCursor(s.cursorWorld);
        } else if (!pendingTimer) {
          pendingTimer = setTimeout(() => {
            pendingTimer = null;
            flushCursor(useUIStore.getState().cursorWorld);
          }, CURSOR_SEND_THROTTLE_MS - elapsed);
        }
      }
    });

    return () => {
      unsubscribe();
      if (pendingTimer) clearTimeout(pendingTimer);
    };
  }, [state.kind]);

  if (state.kind === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-100 text-neutral-500">
        読み込み中…
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-neutral-100">
        <p className="text-neutral-700">{state.message}</p>
        <a href="/dashboard" className="text-sm text-blue-600 hover:underline">
          ダッシュボードへ戻る
        </a>
      </div>
    );
  }

  if (!synced) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-100 text-neutral-500">
        同期中…
      </div>
    );
  }

  return (
    <EditorLayout
      mapDoc={mapDoc}
      mapName={state.meta.name}
      backHref="/dashboard"
      initialScale={initialScale}
      mapId={mapId}
    />
  );
}

export function EditorPage() {
  const { mapId } = useParams<{ mapId?: string }>();
  const [searchParams] = useSearchParams();

  const sParam = searchParams.get("s");
  const parsedScale = sParam ? Number(sParam) : undefined;
  const initialScale = parsedScale !== undefined && Number.isFinite(parsedScale) ? parsedScale : undefined;

  // key={mapId} で route param 変化時に MapDoc/provider を確実に作り直す
  // （同一コンポーネントインスタンスのまま mapId だけ変わるケースへの対策）。
  if (!mapId) return <LocalEditor key="local" mapId="dev-local" initialScale={initialScale} />;
  return <ServerEditor key={mapId} mapId={mapId} initialScale={initialScale} />;
}
