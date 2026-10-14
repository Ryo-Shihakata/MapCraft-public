// M10-2: 性能検証スクリプト。`node scripts/perf-measure.mjs` で実行する（`pnpm dev` を
// 別ターミナルで先に起動しておくこと。/dev/editor はログイン不要のためワーカーの
// D1/E2E_TEST_MODE 設定は不要）。
//
// 計測する3指標（docs/v2-implementation.md §M10-2）:
//   ① 初期表示 < 3s        … PixiApp.buildAll の console.debug ログから取得
//   ② パン・ズーム中の平均フレーム時間 < 18ms（55fps相当） … requestAnimationFrame の
//      デルタを2秒間サンプリング
//   ③ 1オブジェクト編集の再描画 < 5ms … window.__mapcraft.touchOneObject() 実行後の
//      PixiApp.observeObjects の console.debug ログから取得
//
// 5,000オブジェクト（線2,000/エリア1,500/記号1,000/テキスト500、50km四方）は
// apps/web/src/editor/doc/seed.ts の seedPerfObjects が `?seed=perf` で投入する。
import { chromium } from "playwright";

const BASE_URL = process.env.MAPCRAFT_URL ?? "http://localhost:5173";
const TARGET_URL = `${BASE_URL}/dev/editor?seed=perf`;

function parseMsFromLog(text, prefix) {
  const m = new RegExp(`${prefix}.*?([\\d.]+)ms`).exec(text);
  return m ? Number(m[1]) : null;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  let initialBuildMs = null;
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("[PixiApp] initial buildAll")) {
      initialBuildMs = parseMsFromLog(text, "\\[PixiApp\\] initial buildAll \\(\\d+ objects\\) in");
    }
  });

  console.log(`goto ${TARGET_URL}`);
  const navStart = performance.now();
  await page.goto(TARGET_URL, { waitUntil: "load" });

  // GPU 環境の検出。ヘッドレスVM等の SwiftShader（ソフトウェアラスタライザ）では
  // ②のフレーム時間基準は原理的に満たせない（22オブジェクトでも26ms超の実測。
  // docs/v2-decisions.md の M10 エントリ参照）ため、②を参考値扱いに切り替える。
  const glRenderer = await page.evaluate(() => {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") ?? c.getContext("webgl");
    if (!gl) return "no-webgl";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  });
  const softwareGl = /swiftshader|llvmpipe|software/i.test(glRenderer);
  console.log(`GL renderer: ${glRenderer}${softwareGl ? "（ソフトウェア描画: ②は参考値）" : ""}`);

  // 5,000オブジェクトの投入・初回構築完了を待つ（デバッグフックが出るまで）。
  await page.waitForFunction(() => {
    const w = window;
    return typeof w.__mapcraft?.getObjectCount === "function" && w.__mapcraft.getObjectCount() === 5000;
  }, { timeout: 15_000 });
  // buildAll 完了直後の console.debug ログをフラッシュさせるため1フレーム待つ。
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));
  const wallClockMs = performance.now() - navStart;

  console.log(`① 初期表示: buildAll=${initialBuildMs?.toFixed(2) ?? "N/A"}ms / 実測(goto〜投入完了)=${wallClockMs.toFixed(2)}ms`);

  // ② パン・ズーム中の平均フレーム時間（requestAnimationFrame デルタを2秒間サンプリング）。
  const canvas = page.getByTestId("pixi-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("pixi-canvas が見つかりません");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  const frameSamplePromise = page.evaluate(() => {
    return new Promise((resolve) => {
      const deltas = [];
      let last = performance.now();
      const DURATION_MS = 2000;
      const start = last;
      function tick(now) {
        deltas.push(now - last);
        last = now;
        if (now - start < DURATION_MS) {
          requestAnimationFrame(tick);
        } else {
          resolve(deltas);
        }
      }
      requestAnimationFrame(tick);
    });
  });

  // パン（ドラッグ）とホイールズームを2秒間かけて行う。
  await page.mouse.move(cx, cy);
  const panSteps = 30;
  for (let i = 0; i < panSteps; i++) {
    await page.mouse.move(cx + i * 3, cy + Math.sin(i / 3) * 20, { steps: 2 });
    await page.mouse.wheel(0, i % 2 === 0 ? -40 : 40);
    await page.waitForTimeout(2000 / panSteps);
  }

  const deltas = await frameSamplePromise;
  const avgFrameMs = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  console.log(
    `② パン・ズーム中の平均フレーム時間: ${avgFrameMs.toFixed(2)}ms（${(1000 / avgFrameMs).toFixed(1)}fps相当, サンプル${deltas.length}フレーム）`
  );

  // ③ 1オブジェクト編集の再描画時間（touchOneObject → PixiApp の rebuild ログ）。
  let touchMs = null;
  const touchLogPromise = new Promise((resolve) => {
    const handler = (msg) => {
      const text = msg.text();
      if (text.includes("[PixiApp] rebuild 1 object")) {
        const v = parseMsFromLog(text, "\\[PixiApp\\] rebuild 1 object\\(s\\) in");
        if (v !== null) {
          page.off("console", handler);
          resolve(v);
        }
      }
    };
    page.on("console", handler);
  });
  await page.evaluate(() => window.__mapcraft.touchOneObject());
  touchMs = await Promise.race([touchLogPromise, page.waitForTimeout(2000).then(() => null)]);
  console.log(`③ 1オブジェクト編集の再描画: ${touchMs !== null ? `${touchMs.toFixed(2)}ms` : "N/A(ログ未検出)"}`);

  console.log("---");
  console.log(`基準: ①<3000ms ②avg<18ms(≥55fps) ③<5ms`);
  const pass1 = (initialBuildMs ?? wallClockMs) < 3000;
  const pass2 = avgFrameMs < 18;
  const pass3 = touchMs !== null && touchMs < 5;
  const label2 = softwareGl ? (pass2 ? "PASS" : "REF(要実GPU検証)") : pass2 ? "PASS" : "FAIL";
  console.log(`結果: ①${pass1 ? "PASS" : "FAIL"} ②${label2} ③${pass3 ? "PASS" : "FAIL"}`);
  if (softwareGl && !pass2) {
    console.log("→ ② はソフトウェア描画環境のため参考値。実GPUのブラウザで再計測してください（実行方法: SETUP.md）。");
  }

  await browser.close();
  const gate2 = softwareGl ? true : pass2;
  if (!pass1 || !gate2 || !pass3) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
