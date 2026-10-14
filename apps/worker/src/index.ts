import { Hono } from "hono";
import { MapRoom } from "./rooms/MapRoom.js";
import { authHandler } from "./auth.js";
import { requireUser } from "./middleware/session.js";
import mapsRoute from "./routes/maps.js";
import linksRoute from "./routes/links.js";
import shareRoute from "./routes/share.js";
import { mapThumbnailRoute, thumbnailsRoute } from "./routes/thumbnails.js";
import type { AppEnv } from "./env.js";

export { MapRoom };

const app = new Hono<AppEnv>();

app.get("/api/health", (c) => c.json({ ok: true }));

// better-auth（Google OAuth・セッション）。§M2-1
app.on(["GET", "POST"], "/api/auth/*", authHandler);

// ログイン中ユーザー情報。§2.5
app.get("/api/me", requireUser, (c) => c.json(c.get("user")));

// マップメタデータ CRUD。§M2-4
app.route("/api/maps", mapsRoute);

// 共有リンク発行・失効（オーナーのみ。§M8-1）。/api/maps/:id/links* を linksRoute 側で定義する。
app.route("/api/maps", linksRoute);

// 共有リンクからのマップ解決（ログイン必須。§M8-4）。
app.route("/api/share", shareRoute);

// サムネイル保存・配信（§M9-5）。
app.route("/api/maps", mapThumbnailRoute);
app.route("/api/thumbnails", thumbnailsRoute);

export default app;
