// M10-1 シナリオ①: ログイン(e2e Cookie)→マップ作成→線を描く→リロード→残っている。
import { test } from "playwright/test";
import { createMapAndOpenEditor, drawLine, expectObjectCount, loginAs, uniqueEmail } from "./helpers.js";

test("描画したオブジェクトはリロード後も残る", async ({ page, context }) => {
  await loginAs(context, uniqueEmail("persist"));
  await createMapAndOpenEditor(page);

  await drawLine(page, "国道", [
    { x: 300, y: 300 },
    { x: 500, y: 420 },
  ]);
  await expectObjectCount(page, 1);

  await page.reload();
  await page.getByTestId("pixi-canvas").waitFor({ state: "visible" });
  await expectObjectCount(page, 1);
});
