// M10-1 シナリオ③: 閲覧リンクで参加→編集UIが無効。
import { expect, test } from "playwright/test";
import { createMapAndOpenEditor, loginAs, uniqueEmail } from "./helpers.js";

test("閲覧リンク経由の参加者は編集UIが無効化される", async ({ browser }) => {
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await loginAs(contextA, uniqueEmail("owner"));
  await createMapAndOpenEditor(pageA);

  // TopBar「共有」→ 閲覧リンク発行 → URL を取得。
  await pageA.getByRole("button", { name: "共有" }).click();
  const shareDialog = pageA.getByRole("dialog", { name: "共有" });
  await expect(shareDialog).toBeVisible();
  await shareDialog.getByRole("button", { name: "発行" }).first().click();
  const shareInput = shareDialog.locator("input[readonly]").first();
  const shareUrl = await shareInput.inputValue();
  expect(shareUrl).toMatch(/\/s\//);

  // 別ユーザー（閲覧者）が共有リンクから参加する。
  const contextV = await browser.newContext();
  const pageV = await contextV.newPage();
  await loginAs(contextV, uniqueEmail("viewer"));
  await pageV.goto(shareUrl);
  await pageV.waitForURL(/\/edit\//);
  await pageV.getByTestId("pixi-canvas").waitFor({ state: "visible" });

  // 閲覧専用バッジが出て、ツールバーは「選択」のみ（描画ツールが存在しない）。
  await expect(pageV.getByText("閲覧専用")).toBeVisible();
  await expect(pageV.getByTitle(/描画/)).toHaveCount(0);
  await expect(pageV.getByTitle(/選択/)).toHaveCount(1);
  // オーナー専用の「共有」ボタンも出ない。
  await expect(pageV.getByRole("button", { name: "共有" })).toHaveCount(0);

  await contextA.close();
  await contextV.close();
});
