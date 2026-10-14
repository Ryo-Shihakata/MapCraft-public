// サムネイル保存・配信（§2.5, §M9-5）。
// POST /api/maps/:id/thumbnail（編集ロール = owner or 有効な edit リンク）: R2 put + D1 更新。
// GET  /api/thumbnails/:mapId（ログイン必須）: R2 から返却。
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { maps } from "../db/schema.js";
import { requireUser, resolveRole } from "../middleware/session.js";
import type { AppEnv } from "../env.js";

export function thumbnailKeyFor(mapId: string): string {
  return `thumb/${mapId}.png`;
}

// /api/maps/:id/thumbnail に mount する（routes/maps.ts, routes/links.ts と同じベースパス）。
export const mapThumbnailRoute = new Hono<AppEnv>();
mapThumbnailRoute.use("*", requireUser);

mapThumbnailRoute.post("/:id/thumbnail", async (c) => {
  const mapId = c.req.param("id");
  const token = c.req.query("t");
  const resolution = await resolveRole(c.env, mapId, c.get("user"), token);
  if (resolution.kind === "not_found") return c.json({ error: "マップが見つかりません" }, 404);
  if (resolution.kind === "forbidden" || (resolution.role !== "owner" && resolution.role !== "edit")) {
    return c.json({ error: "編集権限が必要です" }, 403);
  }

  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0) return c.json({ error: "画像データが空です" }, 400);

  await c.env.THUMBS.put(thumbnailKeyFor(mapId), body, { httpMetadata: { contentType: "image/png" } });

  const db = drizzle(c.env.DB);
  await db
    .update(maps)
    .set({ thumbnailKey: thumbnailKeyFor(mapId), updatedAt: Date.now() })
    .where(eq(maps.id, mapId));

  return c.json({ ok: true });
});

// /api/thumbnails/:mapId に mount する。
export const thumbnailsRoute = new Hono<AppEnv>();
thumbnailsRoute.use("*", requireUser);

thumbnailsRoute.get("/:mapId", async (c) => {
  const mapId = c.req.param("mapId");
  const obj = await c.env.THUMBS.get(thumbnailKeyFor(mapId));
  if (!obj) return c.json({ error: "サムネイルが見つかりません" }, 404);
  return new Response(obj.body, {
    headers: { "content-type": "image/png", "cache-control": "private, max-age=60" },
  });
});
