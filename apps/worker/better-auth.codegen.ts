// better-auth スキーマ生成 CLI（`pnpm db:generate:auth`）専用の設定。
// ランタイム設定は src/auth.ts が正。ここは生成されるテーブル構成に影響する
// オプション（adapter provider / social provider）だけを一致させたダミー。
// tsconfig の include 外なので Worker のビルドには含まれない。
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export const auth = betterAuth({
  database: drizzleAdapter({}, { provider: "sqlite" }),
  socialProviders: {
    google: { clientId: "codegen-placeholder", clientSecret: "codegen-placeholder" },
  },
});
