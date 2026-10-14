// 未ログインガード（§M2-5）。保護ルートを包み、未ログインなら /login へ。
//
// 認証判定（better-auth セッション + E2E_TEST_MODE フォールバック）は useAuthState に集約
// （§M8: /s/:token の SharePage と共用するため抽出。判定ロジック自体は元実装のまま）。
import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuthState } from "./useAuthState.js";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { pending, authenticated } = useAuthState();

  if (pending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 text-neutral-500">
        読み込み中…
      </div>
    );
  }
  if (!authenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
