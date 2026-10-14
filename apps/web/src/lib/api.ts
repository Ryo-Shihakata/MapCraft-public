// API クライアント（§M2-5）。同一オリジン相対パスで fetch し、応答は zod でパースする。
// エラー時はサーバの `{ error }` を ApiError として throw する。
import { z } from "zod";
import type { MapMeta } from "@mapcraft/shared";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const errorBodySchema = z.object({ error: z.string() });

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const parsed = errorBodySchema.safeParse(await res.json());
      if (parsed.success) message = parsed.data.error;
    } catch {
      // 非 JSON 応答はステータスコードのまま
    }
    throw new ApiError(res.status, message);
  }
  return res.json();
}

const mapMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  myRole: z.enum(["owner", "view", "edit"]),
});

// exactOptionalPropertyTypes のため、undefined を持たない形に詰め替えて MapMeta にする。
function toMapMeta(raw: z.output<typeof mapMetaSchema>): MapMeta {
  const meta: MapMeta = {
    id: raw.id,
    name: raw.name,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    myRole: raw.myRole,
  };
  if (raw.description !== undefined) meta.description = raw.description;
  if (raw.thumbnailUrl !== undefined) meta.thumbnailUrl = raw.thumbnailUrl;
  return meta;
}

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().optional(),
});

export type Me = z.output<typeof userSchema>;

// GET/POST /api/maps/:id/links の応答（§M8-1）。
const linkSchema = z.object({
  token: z.string(),
  role: z.enum(["view", "edit"]),
  createdAt: z.string(),
  revokedAt: z.string().nullable(),
});

export type LinkInfo = z.output<typeof linkSchema>;

// GET /api/share/:token の応答（§M8-4）。
const shareInfoSchema = z.object({
  mapId: z.string(),
  role: z.enum(["owner", "view", "edit"]),
  name: z.string(),
});

export type ShareInfo = z.output<typeof shareInfoSchema>;

export const api = {
  async me(): Promise<Me> {
    return userSchema.parse(await request("/api/me"));
  },

  async listMaps(): Promise<MapMeta[]> {
    const rows = z.array(mapMetaSchema).parse(await request("/api/maps"));
    return rows.map(toMapMeta);
  },

  // GET /api/maps/:id?t=token — EditorPage が mount 時に呼ぶ（§M7-3: 403 → エラーページ）。
  // token は共有リンク経由（/s/:token → sessionStorage）で参加したときのみ渡す（§M8-4）。
  async getMap(id: string, token?: string): Promise<MapMeta> {
    const qs = token ? `?t=${encodeURIComponent(token)}` : "";
    const raw = mapMetaSchema.parse(await request(`/api/maps/${encodeURIComponent(id)}${qs}`));
    return toMapMeta(raw);
  },

  async createMap(name?: string): Promise<MapMeta> {
    const body = name === undefined ? {} : { name };
    const raw = mapMetaSchema.parse(
      await request("/api/maps", { method: "POST", body: JSON.stringify(body) })
    );
    return toMapMeta(raw);
  },

  async renameMap(id: string, name: string): Promise<MapMeta> {
    const raw = mapMetaSchema.parse(
      await request(`/api/maps/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      })
    );
    return toMapMeta(raw);
  },

  async deleteMap(id: string): Promise<void> {
    await request(`/api/maps/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  // GET /api/maps/:id/links — リンク一覧（有効・失効両方。オーナーのみ。§M8-1）。
  async listLinks(mapId: string): Promise<LinkInfo[]> {
    return z.array(linkSchema).parse(await request(`/api/maps/${encodeURIComponent(mapId)}/links`));
  },

  // POST /api/maps/:id/links {role} — 発行（既存有効リンクがあればそれを返す。§M8-1）。
  async createLink(mapId: string, role: "view" | "edit"): Promise<LinkInfo> {
    return linkSchema.parse(
      await request(`/api/maps/${encodeURIComponent(mapId)}/links`, {
        method: "POST",
        body: JSON.stringify({ role }),
      })
    );
  },

  // DELETE /api/maps/:id/links/:token — 失効（§M8-1）。
  async revokeLink(mapId: string, token: string): Promise<void> {
    await request(`/api/maps/${encodeURIComponent(mapId)}/links/${encodeURIComponent(token)}`, {
      method: "DELETE",
    });
  },

  // GET /api/share/:token — 共有リンクからマップを解決する（ログイン必須。失効/不明は404。§M8-4）。
  async getShare(token: string): Promise<ShareInfo> {
    return shareInfoSchema.parse(await request(`/api/share/${encodeURIComponent(token)}`));
  },
};
