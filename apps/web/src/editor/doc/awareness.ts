// awareness state の型とユーザー色生成（実装書 §4.4）。
// provider.ts と overlay 系（リモートカーソル描画）・TopBar（アバター列）が参照する。
import type { Point } from "@mapcraft/shared";

export interface AwarenessUser {
  id: string;
  name: string;
  color: string;
}

// y-protocols/awareness の各クライアント state（自分/他人共通の形）。
export interface AwarenessState {
  user: AwarenessUser;
  cursor: Point | null;
  selection: string[];
}

// overlay・TopBar が消費するリモートユーザー一覧の1エントリ。
export interface RemoteAwarenessEntry {
  clientId: number;
  state: AwarenessState;
}

/**
 * userId のハッシュから HSL 色相を分散させる（彩度70%・明度45%固定。実装書 §4.4）。
 * 同じ userId は常に同じ色になる（決定的）。
 */
export function colorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 45%)`;
}
