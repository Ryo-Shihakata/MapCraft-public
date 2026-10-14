// M10-1 シナリオ④: .fmap エクスポート→ダウンロード検証→インポート→オブジェクト数一致。
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { expect, test } from "playwright/test";
import { createMapAndOpenEditor, drawLine, expectObjectCount, loginAs, uniqueEmail } from "./helpers.js";

test(".fmap をエクスポートし、インポートしたマップのオブジェクト数が一致する", async ({ page, context }) => {
  await loginAs(context, uniqueEmail("fmap"));
  await createMapAndOpenEditor(page);

  await drawLine(page, "国道", [
    { x: 200, y: 200 },
    { x: 420, y: 340 },
  ]);
  await drawLine(page, "大河川", [
    { x: 300, y: 420 },
    { x: 450, y: 520 },
    { x: 600, y: 440 },
  ]);
  await expectObjectCount(page, 2);

  // エクスポート（TopBar「エクスポート ▾」→ 形式.fmap → ダウンロード）。
  await page.getByRole("button", { name: /エクスポート/ }).click();
  const exportDialog = page.getByRole("dialog", { name: "エクスポート" });
  await expect(exportDialog).toBeVisible();
  await exportDialog.getByRole("button", { name: ".fmap", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    exportDialog.getByRole("button", { name: "ダウンロード" }).click(),
  ]);

  const savedPath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "mapcraft-fmap-")), "export.fmap");
  await download.saveAs(savedPath);
  const raw = await fs.readFile(savedPath, "utf-8");
  const parsed = JSON.parse(raw) as { format: string; objects: unknown[] };
  expect(parsed.format).toBe("fmap");
  expect(parsed.objects).toHaveLength(2);

  // インポート（ダッシュボードの「.fmap をインポート」→ 新規マップ作成 → 遷移）。
  await page.goto("/dashboard");
  await page.locator('input[type="file"]').setInputFiles(savedPath);
  await page.waitForURL(/\/edit\//);
  await page.getByTestId("pixi-canvas").waitFor({ state: "visible" });
  await expectObjectCount(page, parsed.objects.length);
});
