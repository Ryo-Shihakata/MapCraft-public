// /api/maps — マップメタデータ CRUD（§2.5, §M2-4, §M7）。
import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { desc, eq } from "drizzle-orm";
import * as Y from "yjs";
import { DEFAULT_LAYERS, type MapMeta, type MapRole } from "@mapcraft/shared";
import { maps } from "../db/schema.js";
import { requireUser, resolveRole, type MapRow } from "../middleware/session.js";
import type { AppEnv, Env } from "../env.js";

// マップ作成時の初期 Y.Doc update を Worker 内の一時 Y.Doc から組み立てる（§4.3-2）。
// Y.Doc スキーマは apps/web/src/editor/doc/MapDoc.ts（§2.2）に厳密に一致させる:
// layers は Y.Map<Y.Map<unknown>>（フィールド粒度）、layerOrder は Y.Array<string>、
// meta は { schemaVersion: 2 } を持つ Y.Map。objects は空のまま（クライアントと同じく
// 遅延生成に任せる）。
function buildSeedUpdate(): Uint8Array {
  const doc = new Y.Doc();
  const yLayers = doc.getMap<Y.Map<unknown>>("layers");
  const yLayerOrder = doc.getArray<string>("layerOrder");
  const yMeta = doc.getMap("meta");
  doc.transact(() => {
    for (const layer of DEFAULT_LAYERS) {
      const yLayer = new Y.Map<unknown>();
      for (const [k, v] of Object.entries(layer)) yLayer.set(k, v);
      yLayers.set(layer.id, yLayer);
      yLayerOrder.push([layer.id]);
    }
    yMeta.set("schemaVersion", 2);
  });
  const update = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return update;
}

/** E2E_TEST_MODE のときだけ true（デバッグ用エンドポイントのガード）。 */
function isE2EModeEnabled(env: Env): boolean {
  const v = env.E2E_TEST_MODE;
  return v !== undefined && v !== "" && v !== "0" && v !== "false";
}

const nameSchema = z.string().trim().min(1, "名前は必須です").max(100);

const createBodySchema = z.object({
  name: nameSchema.optional(),
});

const patchBodySchema = z
  .object({
    name: nameSchema.optional(),
    description: z.string().max(2000).optional(),
  })
  .refine((b) => b.name !== undefined || b.description !== undefined, {
    message: "name か description のいずれかが必要です",
  });

function toMapMeta(row: MapRow, role: MapRole): MapMeta {
  const meta: MapMeta = {
    id: row.id,
    name: row.name,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    myRole: role,
  };
  if (row.description != null) meta.description = row.description;
  // thumbnail_key があれば配信エンドポイント（GET /api/thumbnails/:mapId）を指す URL を組み立てる（§M9-5）。
  if (row.thumbnailKey != null) meta.thumbnailUrl = `/api/thumbnails/${row.id}`;
  return meta;
}

/** JSON ボディを安全に読む（空ボディ・非 JSON は {} 扱い）。 */
async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
}

const app = new Hono<AppEnv>();

app.use("*", requireUser);

// GET /api/maps — 自分のマップ一覧
app.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select()
    .from(maps)
    .where(eq(maps.ownerId, c.get("user").id))
    .orderBy(desc(maps.updatedAt))
    .all();
  return c.json(rows.map((row) => toMapMeta(row, "owner")));
});

// POST /api/maps — 作成 → D1 insert → DO seed()（M7 で実 update に置換）
app.post("/", async (c) => {
  const parsed = createBodySchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "invalid body" }, 400);

  const now = Date.now();
  const row: MapRow = {
    id: crypto.randomUUID(),
    ownerId: c.get("user").id,
    name: parsed.data.name ?? "新しい地図",
    description: null,
    thumbnailKey: null,
    createdAt: now,
    updatedAt: now,
  };
  const db = drizzle(c.env.DB);
  await db.insert(maps).values(row);

  // DEFAULT_LAYERS 7つ + meta schemaVersion=2 を積んだ初期 update を DO へ渡す（§4.3-2）。
  const stub = c.env.MAP_ROOM.get(c.env.MAP_ROOM.idFromName(row.id));
  await stub.seed(buildSeedUpdate());

  return c.json(toMapMeta(row, "owner"), 201);
});

// GET /api/maps/:id?t=token — MapMeta（myRole 込み）。owner は token 不要、それ以外は
// 有効な共有リンク token が必要（§M8-2）。
app.get("/:id", async (c) => {
  const token = c.req.query("t");
  const resolution = await resolveRole(c.env, c.req.param("id"), c.get("user"), token);
  if (resolution.kind === "not_found") return c.json({ error: "マップが見つかりません" }, 404);
  if (resolution.kind === "forbidden") return c.json({ error: "アクセス権がありません" }, 403);
  return c.json(toMapMeta(resolution.map, resolution.role));
});

// PATCH /api/maps/:id — 改名・説明の更新（オーナーのみ）
app.patch("/:id", async (c) => {
  const resolution = await resolveRole(c.env, c.req.param("id"), c.get("user"));
  if (resolution.kind === "not_found") return c.json({ error: "マップが見つかりません" }, 404);
  if (resolution.kind === "forbidden" || resolution.role !== "owner") {
    return c.json({ error: "オーナーのみ操作できます" }, 403);
  }

  const parsed = patchBodySchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "invalid body" }, 400);

  const patch: Partial<Pick<MapRow, "name" | "description">> & { updatedAt: number } = {
    updatedAt: Date.now(),
  };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.description !== undefined) patch.description = parsed.data.description;

  const db = drizzle(c.env.DB);
  await db.update(maps).set(patch).where(eq(maps.id, resolution.map.id));
  const updated = await db.select().from(maps).where(eq(maps.id, resolution.map.id)).get();
  if (!updated) return c.json({ error: "マップが見つかりません" }, 404);
  return c.json(toMapMeta(updated, "owner"));
});

// DELETE /api/maps/:id — D1 delete → DO purge() → R2 サムネイル削除（§M9-5）。
app.delete("/:id", async (c) => {
  const resolution = await resolveRole(c.env, c.req.param("id"), c.get("user"));
  if (resolution.kind === "not_found") return c.json({ error: "マップが見つかりません" }, 404);
  if (resolution.kind === "forbidden" || resolution.role !== "owner") {
    return c.json({ error: "オーナーのみ操作できます" }, 403);
  }

  const db = drizzle(c.env.DB);
  await db.delete(maps).where(eq(maps.id, resolution.map.id));

  const stub = c.env.MAP_ROOM.get(c.env.MAP_ROOM.idFromName(resolution.map.id));
  await stub.purge();

  // サムネイルが無い（thumbnailKey が null）場合も R2 delete はエラーにならないため無条件に呼ぶ。
  await c.env.THUMBS.delete(`thumb/${resolution.map.id}.png`);

  return c.json({ ok: true });
});

// GET /api/maps/:id/ws?t=token — WebSocket upgrade を MapRoom DO へ転送する（§4.3-2）。
// resolveRole で 403/404 を先に返し、OK なら role を x-map-role ヘッダに載せて転送する。
app.get("/:id/ws", async (c) => {
  const mapId = c.req.param("id");
  const token = c.req.query("t");
  const resolution = await resolveRole(c.env, mapId, c.get("user"), token);
  if (resolution.kind === "not_found") return c.json({ error: "マップが見つかりません" }, 404);
  if (resolution.kind === "forbidden") return c.json({ error: "アクセス権がありません" }, 403);

  const headers = new Headers(c.req.raw.headers);
  headers.set("x-map-role", resolution.role);
  const forwardedRequest = new Request(c.req.raw, { headers });

  const stub = c.env.MAP_ROOM.get(c.env.MAP_ROOM.idFromName(mapId));
  return stub.fetch(forwardedRequest);
});

// GET /api/maps/:id/debug/updates-count — DEV/E2E 限定。DO SQLite updates 行数を返す
// （M7 DoD の圧縮検証: 201 update 投入後に 1 桁へ縮むことの確認用。§M7-検証手順）。
app.get("/:id/debug/updates-count", async (c) => {
  if (!isE2EModeEnabled(c.env)) return c.json({ error: "not found" }, 404);
  const resolution = await resolveRole(c.env, c.req.param("id"), c.get("user"));
  if (resolution.kind === "not_found") return c.json({ error: "マップが見つかりません" }, 404);
  if (resolution.kind === "forbidden") return c.json({ error: "アクセス権がありません" }, 403);

  const stub = c.env.MAP_ROOM.get(c.env.MAP_ROOM.idFromName(c.req.param("id")));
  const count = await stub.debugRowCount();
  return c.json({ count });
});

export default app;
