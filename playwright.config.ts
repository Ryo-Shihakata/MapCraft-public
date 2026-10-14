// M10-1: Playwright E2E ランナー設定。`pnpm e2e` から実行する。
//
// 前提（README/SETUP.md にも記載）:
//   - apps/worker/.dev.vars に E2E_TEST_MODE=1 が設定されていること（認証は
//     e2e-user Cookie 方式。docs/v2-decisions.md の M7 エントリ参照）。
//   - `pnpm db:migrate:local` を一度実行済みであること（D1 ローカル DB）。
// webServer で `pnpm dev`（web=5173 / worker=8787）を自動起動する。既に起動済みなら
// reuseExistingServer で再利用する（手動起動しておいてもよい）。
import { defineConfig, devices } from "playwright/test";

const BASE_URL = "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // 各テストは独立だが、共有の dev サーバー・DB に対して実行するため直列化する
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
    cwd: __dirname,
  },
});
