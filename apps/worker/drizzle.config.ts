import { defineConfig } from "drizzle-kit";

// D1 マイグレーション生成設定。実際の適用は wrangler d1 migrations apply で行う
// （drizzle-kit 自体は D1 に接続しない。生成のみに使う）。
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
