// `/s/:token` — 共有リンクの入口（§M8-4）。
// 未ログイン → /login?redirect=/s/:token（ログイン後にここへ戻す）。
// ログイン済み → GET /api/share/:token → sessionStorage に {mapId: token} を保存して
// `/edit/:mapId` へ遷移。失効/不明な token は「リンクが無効です」ページ。
import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { useAuthState } from "../auth/useAuthState.js";
import { api, ApiError } from "../lib/api.js";
import { setShareToken } from "../lib/shareToken.js";

type ResolveState = { kind: "loading" } | { kind: "invalid" } | { kind: "error"; message: string };

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100 text-neutral-500">{children}</div>
  );
}

export function SharePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { pending, authenticated } = useAuthState();
  const [state, setState] = useState<ResolveState>({ kind: "loading" });

  useEffect(() => {
    if (pending || !authenticated || !token) return;
    let cancelled = false;
    api
      .getShare(token)
      .then((info) => {
        if (cancelled) return;
        setShareToken(info.mapId, token);
        navigate(`/edit/${info.mapId}`, { replace: true });
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) setState({ kind: "invalid" });
        else setState({ kind: "error", message: e instanceof ApiError ? e.message : "リンクの確認に失敗しました" });
      });
    return () => {
      cancelled = true;
    };
  }, [pending, authenticated, token, navigate]);

  if (!token) return <Navigate to="/dashboard" replace />;
  if (pending) return <CenteredMessage>読み込み中…</CenteredMessage>;
  if (!authenticated) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(`/s/${token}`)}`} replace />;
  }

  if (state.kind === "invalid") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-neutral-100">
        <p className="text-neutral-700">リンクが無効です</p>
        <a href="/dashboard" className="text-sm text-blue-600 hover:underline">
          ダッシュボードへ戻る
        </a>
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
  return <CenteredMessage>読み込み中…</CenteredMessage>;
}
