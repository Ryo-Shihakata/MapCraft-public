import { defineConfig } from "vitest/config";

// ルートから packages/shared・apps/web・apps/worker のテストを一括実行する。
// apps/worker は M7 で MapRoom の圧縮ロジック等（純関数）のユニットテストを追加した
// （DO 本体は cloudflare:workers ランタイム依存だが、computeMergedUpdate 等は
// Yjs のみに依存する純関数なので Node 環境でそのままテストできる）。
// 各パッケージにテストが無くても失敗させない（passWithNoTests）。
export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: ["packages/shared", "apps/web", "apps/worker"],
  },
});
