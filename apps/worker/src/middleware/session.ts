// セッション解決ミドルウェア（§M2-2, M2-3, §M7）。
// requireUser: 401 ガード。E2E_TEST_MODE のときだけ x-e2e-user 認証を許可。
// resolveRole: §2.5 のロール解決。M2 時点では owner 判定のみ（link は M8 で拡張）。
import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import type { LinkRole, MapRole } from "@mapcraft/shared";
import { getSession, type SessionUser } from "../auth.js";
import { maps, mapLinks, user as userTable } from "../db/schema.js";
import type { AppEnv, Env } from "../env.js";

// E2E テストログインの Cookie 名。§M7 で発見した事情: ブラウザの WebSocket ハンドシェイクは
// JS からカスタムヘッダを付与できず、Playwright の extraHTTPHeaders も（少なくとも本プロジェクト
// 検証時点の Chromium では）WS ハンドシェイクに適用されないため、`x-e2e-user` ヘッダだけでは
// `GET /api/maps/:id/ws` を E2E 認証できない（実測: 401）。Cookie はブラウザが自動送信するため
// WS ハンドシェイクにも乗る。ヘッダ方式はそのまま残し、Cookie を追加のフォールバックとする
// （docs/v2-decisions.md に記録）。
const E2E_COOKIE_NAME = "e2e-user";

function isE2EModeEnabled(env: Env): boolean {
  const v = env.E2E_TEST_MODE;
  return v !== undefined && v !== "" && v !== "0" && v !== "false";
}

/** E2E テストモード: x-e2e-user のメールを「ログイン済みユーザー」として扱う（無ければ upsert）。 */
async function resolveE2EUser(env: Env, email: string): Promise<SessionUser> {
  const db = drizzle(env.DB);
  const found = await db
    .select()
    .from(userTable)
    .where(eq(userTable.email, email))
    .get();
  if (found) {
    return found.image == null
      ? { id: found.id, name: found.name, email: found.email }
      : { id: found.id, name: found.name, email: found.email, image: found.image };
  }
  const now = new Date();
  const created = {
    id: crypto.randomUUID(),
    name: email.split("@")[0] ?? email,
    email,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  };
  // 並行リクエストで同時 insert された場合は unique(email) に当たるので握りつぶして再取得する。
  await db.insert(userTable).values(created).onConflictDoNothing({ target: userTable.email });
  const row = await db
    .select()
    .from(userTable)
    .where(eq(userTable.email, email))
    .get();
  if (!row) throw new Error("E2E user upsert failed");
  return { id: row.id, name: row.name, email: row.email };
}

/** ログイン必須ガード。未ログインは 401 `{error}`。ユーザーは c.get("user") で参照。 */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  if (isE2EModeEnabled(c.env)) {
    // ヘッダ優先。WS ハンドシェイクではヘッダが乗らないため Cookie もフォールバックとして見る。
    const e2eEmail = c.req.header("x-e2e-user") ?? getCookie(c, E2E_COOKIE_NAME);
    if (e2eEmail) {
      c.set("user", await resolveE2EUser(c.env, e2eEmail));
      return next();
    }
  }
  const user = await getSession(c);
  if (!user) return c.json({ error: "ログインが必要です" }, 401);
  c.set("user", user);
  return next();
});

export type MapRow = typeof maps.$inferSelect;
export type MapLinkRow = typeof mapLinks.$inferSelect;

export type RoleResolution =
  | { kind: "ok"; map: MapRow; role: MapRole }
  | { kind: "not_found" }
  | { kind: "forbidden" };

/**
 * 共有リンク行から役割を判定する純関数（§M8-2）。失効済み（`revokedAt !== null`）・
 * 別マップの token（別マップの link を渡した token で今開いているマップへアクセスさせない）
 * は無効として扱う。D1 に依存しないのでユニットテスト可能。
 */
export function decideRoleFromLink(mapId: string, link: MapLinkRow | undefined): LinkRole | null {
  if (!link) return null;
  if (link.revokedAt !== null) return null;
  if (link.mapId !== mapId) return null;
  return link.role as LinkRole;
}

/**
 * ロール解決（§2.5）。owner_id 一致 → "owner"。owner 以外は `?t=` の共有リンクを
 * map_links から検証し（revoked_at IS NULL かつ map_id 一致）その role を採用する（§M8-2）。
 * トークンが無い/無効なら forbidden。
 */
export async function resolveRole(
  env: Env,
  mapId: string,
  user: SessionUser,
  token?: string
): Promise<RoleResolution> {
  const db = drizzle(env.DB);
  const map = await db.select().from(maps).where(eq(maps.id, mapId)).get();
  if (!map) return { kind: "not_found" };
  if (map.ownerId === user.id) return { kind: "ok", map, role: "owner" };
  if (token) {
    const link = await db.select().from(mapLinks).where(eq(mapLinks.token, token)).get();
    const role = decideRoleFromLink(mapId, link);
    if (role) return { kind: "ok", map, role };
  }
  return { kind: "forbidden" };
}
