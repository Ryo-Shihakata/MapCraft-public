// Worker の Bindings / Hono 環境型。index / auth / middleware / routes で共有する。
import type { MapRoom } from "./rooms/MapRoom.js";
import type { SessionUser } from "./auth.js";

export interface Env {
  ASSETS: Fetcher;
  MAP_ROOM: DurableObjectNamespace<MapRoom>;
  DB: D1Database;
  THUMBS: R2Bucket;
  // §5 環境変数（ローカルは .dev.vars、本番は wrangler secret / vars）
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  E2E_TEST_MODE?: string; // truthy でテストログイン有効（本番には絶対に設定しない。§M10）
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    user: SessionUser;
  };
};
