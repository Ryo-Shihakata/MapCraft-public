// /api/maps/:id/links — 共有リンクの発行・一覧・失効（§2.5, §M8-1）。オーナーのみ。
import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { and, eq, isNull } from "drizzle-orm";
import type { LinkRole } from "@mapcraft/shared";
import { mapLinks } from "../db/schema.js";
import { requireUser, resolveRole, type MapLinkRow } from "../middleware/session.js";
import type { AppEnv } from "../env.js";

// token = crypto.getRandomValues(24バイト) → base64url（32文字。§M8-1）。
function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

interface LinkDto {
  token: string;
  role: LinkRole;
  createdAt: string;
  revokedAt: string | null;
}

function toLinkDto(row: MapLinkRow): LinkDto {
  return {
    token: row.token,
    role: row.role as LinkRole,
    createdAt: new Date(row.createdAt).toISOString(),
    revokedAt: row.revokedAt === null ? null : new Date(row.revokedAt).toISOString(),
  };
}

/** JSON ボディを安全に読む（空ボディ・非 JSON は {} 扱い。routes/maps.ts と同じ方針）。 */
async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
}

const roleBodySchema = z.object({ role: z.enum(["view", "edit"]) });

const app = new Hono<AppEnv>();

app.use("*", requireUser);

// GET /api/maps/:id/links — リンク一覧（有効・失効両方。オーナーのみ）
app.get("/:id/links", async (c) => {
  const mapId = c.req.param("id");
  const resolution = await resolveRole(c.env, mapId, c.get("user"));
  if (resolution.kind === "not_found") return c.json({ error: "マップが見つかりません" }, 404);
  if (resolution.kind === "forbidden" || resolution.role !== "owner") {
    return c.json({ error: "オーナーのみ操作できます" }, 403);
  }

  const db = drizzle(c.env.DB);
  const rows = await db.select().from(mapLinks).where(eq(mapLinks.mapId, mapId)).all();
  return c.json(rows.map(toLinkDto));
});

// POST /api/maps/:id/links {role} — 発行。既存の有効リンク（同 role）があればそれを返す（冪等）。
app.post("/:id/links", async (c) => {
  const mapId = c.req.param("id");
  const resolution = await resolveRole(c.env, mapId, c.get("user"));
  if (resolution.kind === "not_found") return c.json({ error: "マップが見つかりません" }, 404);
  if (resolution.kind === "forbidden" || resolution.role !== "owner") {
    return c.json({ error: "オーナーのみ操作できます" }, 403);
  }

  const parsed = roleBodySchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "invalid body" }, 400);

  const db = drizzle(c.env.DB);
  const existing = await db
    .select()
    .from(mapLinks)
    .where(and(eq(mapLinks.mapId, mapId), eq(mapLinks.role, parsed.data.role), isNull(mapLinks.revokedAt)))
    .get();
  if (existing) return c.json(toLinkDto(existing));

  const row: MapLinkRow = {
    token: generateToken(),
    mapId,
    role: parsed.data.role,
    createdAt: Date.now(),
    revokedAt: null,
  };
  await db.insert(mapLinks).values(row);
  return c.json(toLinkDto(row), 201);
});

// DELETE /api/maps/:id/links/:token — 失効（revoked_at セット。物理削除しない）
app.delete("/:id/links/:token", async (c) => {
  const mapId = c.req.param("id");
  const token = c.req.param("token");
  const resolution = await resolveRole(c.env, mapId, c.get("user"));
  if (resolution.kind === "not_found") return c.json({ error: "マップが見つかりません" }, 404);
  if (resolution.kind === "forbidden" || resolution.role !== "owner") {
    return c.json({ error: "オーナーのみ操作できます" }, 403);
  }

  const db = drizzle(c.env.DB);
  const link = await db.select().from(mapLinks).where(eq(mapLinks.token, token)).get();
  if (!link || link.mapId !== mapId) return c.json({ error: "リンクが見つかりません" }, 404);

  await db.update(mapLinks).set({ revokedAt: Date.now() }).where(eq(mapLinks.token, token));
  return c.json({ ok: true });
});

export default app;
