// better-auth の設定・呼び出しをこのファイルに完全隔離する（§M2-1）。
// 他モジュールは createAuth / getSession / authHandler / SessionUser だけに依存し、
// フォールバック（arctic + 自前 session）へ差し替える場合もこのエクスポートを維持する。
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";
import * as schema from "./db/schema.js";
import type { AppEnv, Env } from "./env.js";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image?: string;
}

export function createAuth(env: Env) {
  const db = drizzle(env.DB, { schema });
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    // セッション Cookie は better-auth 既定で httpOnly / sameSite=lax、
    // baseURL が https のとき secure が付く（§M2-1 の要件どおり）。
    // ローカルは Vite(5173) → Worker(8787) のプロキシ構成のため Origin が 5173 になる。
    trustedOrigins: env.BETTER_AUTH_URL.startsWith("http://localhost")
      ? ["http://localhost:5173"]
      : [],
  });
}

/** `/api/auth/*` を better-auth のハンドラへ委譲する。 */
export function authHandler(c: Context<AppEnv>): Promise<Response> {
  return createAuth(c.env).handler(c.req.raw);
}

/** Cookie セッションからログインユーザーを取得する（E2E 分岐は middleware/session.ts 側）。 */
export async function getSession(c: Context<AppEnv>): Promise<SessionUser | null> {
  const session = await createAuth(c.env).api.getSession({
    headers: c.req.raw.headers,
  });
  if (!session) return null;
  const { id, name, email, image } = session.user;
  return image == null ? { id, name, email } : { id, name, email, image };
}
