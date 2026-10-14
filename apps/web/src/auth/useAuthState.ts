// 認証状態フック。better-auth の useSession に加えて E2E_TEST_MODE の x-e2e-user
// フォールバック確認を行う（RequireAuth と /s/:token の SharePage で共通利用。§M8-4）。
//
// better-auth のクライアントセッションが無くても、E2E_TEST_MODE の /api/me フォールバックが
// 成立すればログイン済みとして扱う（RequireAuth の元実装を踏襲。詳細コメントはそちら参照）。
import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { useSession } from "./useSession.js";

export interface AuthState {
  /** true の間は判定中（session と E2E フォールバックの両方が未確定）。 */
  pending: boolean;
  authenticated: boolean;
}

export function useAuthState(): AuthState {
  const { data: session, isPending } = useSession();
  const [e2eChecked, setE2eChecked] = useState(false);
  const [e2eAuthenticated, setE2eAuthenticated] = useState(false);

  useEffect(() => {
    if (session || isPending) return;
    let cancelled = false;
    api
      .me()
      .then(() => {
        if (!cancelled) setE2eAuthenticated(true);
      })
      .catch(() => {
        if (!cancelled) setE2eAuthenticated(false);
      })
      .finally(() => {
        if (!cancelled) setE2eChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [session, isPending]);

  if (isPending) return { pending: true, authenticated: false };
  if (session) return { pending: false, authenticated: true };
  if (!e2eChecked) return { pending: true, authenticated: false };
  return { pending: false, authenticated: e2eAuthenticated };
}
