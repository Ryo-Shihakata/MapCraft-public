// D1 スキーマ（§2.4）。better-auth 管理テーブルは auth-schema.ts（CLI 生成）を参照。
import { sqliteTable, text, integer, index, check } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { user } from "./auth-schema.js";

export * from "./auth-schema.js";

export const maps = sqliteTable(
  "maps",
  {
    id: text("id").primaryKey(), // crypto.randomUUID()
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("新しい地図"),
    description: text("description"),
    thumbnailKey: text("thumbnail_key"), // R2 キー（M9）
    createdAt: integer("created_at").notNull(), // epoch ms
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("idx_maps_owner").on(table.ownerId)]
);

export const mapLinks = sqliteTable(
  "map_links",
  {
    token: text("token").primaryKey(), // URL-safe 32文字乱数（M8 で発行）
    mapId: text("map_id")
      .notNull()
      .references(() => maps.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // 'view' | 'edit'
    createdAt: integer("created_at").notNull(),
    revokedAt: integer("revoked_at"), // NULL=有効
  },
  (table) => [
    index("idx_links_map").on(table.mapId),
    check("map_links_role_check", sql`${table.role} IN ('view','edit')`),
  ]
);
