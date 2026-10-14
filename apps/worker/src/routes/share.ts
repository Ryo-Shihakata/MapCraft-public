// /api/share/:token — 共有リンクからのマップ解決（§2.5, §M8-4）。ログイン必須。失効/不明は404。
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import type { LinkRole } from "@mapcraft/shared";
import { maps, mapLinks } from "../db/schema.js";
import { requireUser } from "../middleware/session.js";
import type { AppEnv } from "../env.js";

const app = new Hono<AppEnv>();

app.use("*", requireUser);

// GET /api/share/:token — {mapId, role, name}。revoked_at が付いている/存在しない token は 404。
app.get("/:token", async (c) => {
  const token = c.req.param("token");
  const db = drizzle(c.env.DB);

  const link = await db.select().from(mapLinks).where(eq(mapLinks.token, token)).get();
  if (!link || link.revokedAt !== null) return c.json({ error: "リンクが無効です" }, 404);

  const map = await db.select().from(maps).where(eq(maps.id, link.mapId)).get();
  if (!map) return c.json({ error: "リンクが無効です" }, 404);

  return c.json({ mapId: link.mapId, role: link.role as LinkRole, name: map.name });
});

export default app;
