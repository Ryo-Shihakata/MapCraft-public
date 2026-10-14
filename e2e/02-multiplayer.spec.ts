// M10-1 シナリオ②: 2コンテキスト同時編集（A が描く→B に現れる）。
// 同一オーナーの2ブラウザコンテキストで同じマップを開き、WS 経由の同期を検証する。
import { test } from "playwright/test";
import { createMapAndOpenEditor, drawLine, expectObjectCount, loginAs, uniqueEmail } from "./helpers.js";

test("Aが描いた線がBの画面に反映される", async ({ browser }) => {
  const email = uniqueEmail("multiplayer");

  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await loginAs(contextA, email);
  const mapId = await createMapAndOpenEditor(pageA);

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await loginAs(contextB, email);
  await pageB.goto(`/edit/${mapId}`);
  await pageB.getByTestId("pixi-canvas").waitFor({ state: "visible" });

  await expectObjectCount(pageA, 0);
  await expectObjectCount(pageB, 0);

  await drawLine(pageA, "国道", [
    { x: 250, y: 250 },
    { x: 480, y: 380 },
  ]);
  await expectObjectCount(pageA, 1);

  // WS 経由での反映は非同期（実装書 §M7 DoD: ~100ms 目安）。expect.poll がリトライする。
  await expectObjectCount(pageB, 1);

  await contextA.close();
  await contextB.close();
});
