// M10-1: E2E テスト共通ヘルパー。
//
// 認証は E2E_TEST_MODE の Cookie 方式（`e2e-user`。docs/v2-decisions.md の M7 エントリ参照）。
// ブラウザの WebSocket ハンドシェイクは JS からカスタムヘッダを送れないため、
// x-e2e-user ヘッダではなく Cookie を使う（2コンテキスト同時編集シナリオで WS が必要）。
//
// window.__mapcraft は apps/web/src/editor/ui/EditorLayout.tsx が DEV ビルドのみで
// 生やすデバッグフック（オブジェクト数の取得）。
import type { BrowserContext, Page } from "playwright/test";
import { expect } from "playwright/test";

export const BASE_URL = "http://localhost:5173";

/** 各テストで固有の e2e-user メールを発行する（テスト間の独立性を保つ）。 */
export function uniqueEmail(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/** 指定コンテキストに e2e-user Cookie を設定する（以降のリクエスト・WS でログイン済み扱い）。 */
export async function loginAs(context: BrowserContext, email: string): Promise<void> {
  await context.addCookies([
    { name: "e2e-user", value: email, url: BASE_URL, sameSite: "Lax" },
  ]);
}

/** ダッシュボードで「＋ 新しい地図」を押し、エディタへ遷移して初回同期完了まで待つ。mapId を返す。 */
export async function createMapAndOpenEditor(page: Page): Promise<string> {
  await page.goto(`${BASE_URL}/dashboard`);
  await page.getByRole("button", { name: /新しい地図/ }).click();
  await page.waitForURL(/\/edit\//);
  await page.getByTestId("pixi-canvas").waitFor({ state: "visible" });
  const match = /\/edit\/([^/?#]+)/.exec(page.url());
  if (!match?.[1]) throw new Error(`mapId をURLから抽出できませんでした: ${page.url()}`);
  return match[1];
}

/**
 * 描画ツールでカタログ項目を選び、canvas 上の points をクリックして線/エリアを確定する
 * （line は2点以上、Enter で確定。実装書 §M4-3）。
 */
export async function drawLine(
  page: Page,
  itemName: string,
  points: Array<{ x: number; y: number }>
): Promise<void> {
  await page.getByTitle(/描画/).click();
  await page.getByPlaceholder("カタログを検索...").fill(itemName);
  await page.getByRole("button", { name: itemName, exact: true }).click();

  const canvas = page.getByTestId("pixi-canvas");
  for (const pt of points) {
    await canvas.click({ position: pt });
  }
  await page.keyboard.press("Enter");
}

/** window.__mapcraft.getObjectCount() を読む（DEV ビルドのみ存在。§M10-1 のデバッグフック）。 */
export async function objectCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const w = window as unknown as { __mapcraft?: { getObjectCount: () => number } };
    return w.__mapcraft?.getObjectCount() ?? -1;
  });
}

/** objectCount が期待値になるまで待つ（同期・再描画の非同期反映を吸収）。 */
export async function expectObjectCount(page: Page, expected: number): Promise<void> {
  await expect.poll(() => objectCount(page)).toBe(expected);
}
