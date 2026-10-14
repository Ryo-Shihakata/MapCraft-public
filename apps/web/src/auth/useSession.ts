// セッションフック。コンポーネントは authClient を直接触らずこれを使う。
import { authClient } from "./authClient.js";

// declaration 生成のため明示的な型名を与える（TS2883 対策）。
export type SessionState = ReturnType<typeof authClient.useSession>;

export function useSession(): SessionState {
  return authClient.useSession();
}
