# v2 逸脱ログ

`docs/v2-implementation.md` §0.3 に基づき、実装書どおりに進められなかった事情をここに記録する。

## 記入形式

各エントリは以下の項目を持つ Markdown 見出し（`### `）として追記する。

```
### YYYY-MM-DD Mn: 短い表題

- **対象M**: Mn
- **問題**: 何が仕様どおりにできなかったか
- **採った代替案**: 実際に何をしたか
- **影響**: 後続のマイルストーンやDoDへの影響
```

新しいエントリは末尾に追記する（古い順）。実装書側の修正が必要な場合は、該当エントリからリンクした上で `v2-implementation.md` 本文も合わせて更新すること。

---

<!-- ここから下に日付順でエントリを追記していく -->

### 2026-07-04 M0: 旧コード削除前の最終コミットハッシュ

- **対象M**: M0
- **問題**: なし（記録目的のエントリ）。仕様1〜2により、`apps/api` / `apps/web` / `packages/shared` を `git rm -r` で削除する前に、M1以降の移植作業（`git show <hash>:path` での参照）のために削除前最終コミットのハッシュを残しておく必要がある。
- **採った代替案**: 削除前の最終コミット `5f4be9b`（`docs(M0): archive v1 docs to docs/archive/v1/`）のハッシュをここに記録する。M1/M3などで旧実装を参照する際は `git show 5f4be9b:apps/web/src/lib/coords.ts` のように取得できる。
- **影響**: なし。参照用情報。

### 2026-07-04 M0: R2 バケット作成が実行できず（R2 未有効化）

- **対象M**: M0
- **問題**: 仕様3にある `wrangler r2 bucket create mapcraft-thumbnails` を実行したところ、Cloudflare API が `[code: 10042] Please enable R2 through the Cloudflare Dashboard.` を返し失敗した。同アカウントでは R2 が未有効化のため。なお `wrangler d1 create mapcraft` は成功し、`database_id: <your-d1-database-id>` を取得できたので `wrangler.jsonc` の `d1_databases[0].database_id` に反映済み。
- **採った代替案**: `wrangler.jsonc` の `r2_buckets[0].bucket_name` は仕様どおり `"mapcraft-thumbnails"` のままとし、実バケットは未作成の状態で先へ進む。ローカル開発は `wrangler dev`（`--local` 相当のローカルシミュレーション）で R2 バインディングが miniflare 側にエミュレートされるため、バケット未作成でも支障はない。
- **影響**: 本番デプロイ・リモートR2操作（サムネイル保存等、M9 以降で使用）の前に、ユーザーが Cloudflare ダッシュボードで R2 を有効化した上で `wrangler r2 bucket create mapcraft-thumbnails` を再実行する必要がある。M0 の DoD（ローカル開発が `--local` で動くこと）には影響しない。

### 2026-07-04 M1: 記号ギャラリーを Vite ルートではなく生成スクリプトで提供（承認済み逸脱）

- **対象M**: M1
- **問題**: 実装書 M1-3 は目視確認用ページを `apps/web/src/dev/SymbolGallery.tsx`（ルート `/dev/symbols`）に置くと指定しているが、apps/web は M2 担当 agent が並行編集中のため、M1 側から触ると衝突する（親エージェント承認済みの逸脱）。
- **採った代替案**: `packages/shared/scripts/gen-symbol-gallery.mjs` を新設。`node packages/shared/scripts/gen-symbol-gallery.mjs` で symbolPaths.ts / catalog.ts を正規表現抽出し、全50記号を名前付きで並べた単一 HTML を `packages/shared/symbol-gallery.html`（gitignore 済み）へ出力する。抽出を成立させるため symbolPaths.ts に記述規則（1エントリ1行・キーは二重引用符・絶対座標コマンドのみ）を設けた。
- **影響**: `/dev/symbols` ルートの配線は M3 で行う（SymbolGallery.tsx は SYMBOL_PATHS を直接 import すればよく、本スクリプトとは独立）。M1 DoD の「/dev/symbols で50記号表示」は「symbol-gallery.html で50記号表示」に読み替える。

### 2026-07-04 M1: 記号形状を国土地理院の実記号に合わせて v1 から変更した点

- **対象M**: M1
- **問題**: 実装書 §3.2 は「v1 で簡略化しすぎたものは GSI の記号一覧を参照して修正してよい（修正したら列挙）」としている。また v1 はテキストグリフ描画（文・卍・♨・✈・〒）に PIXI.Text を使っており、単一 SVG パス化にあたり全てパスで再定義する必要があった。
- **採った代替案**: 以下を v1 から変更（それ以外の 24×24 パスは v1 描画ロジックの等価変換）。
  - `triangle`（三角点）: v1 は塗り三角形 → GSI に合わせ「白抜き三角形＋中心点」に修正（塗り三角形は `peak` 専用に）
  - `triangle_e`（電子基準点）: v1 は白抜き三角形のみ → 白抜き三角形＋内部の矩形（アンテナ塔の抽象化）
  - `benchmark`（水準点）: v1 は「円＋横線」→ GSI の「正方形＋中心点」に修正
  - `mine-sym`（採石地）: v1 は交差2直線のみ → 交差ハンマー（⚒）としてヘッド線を追加
  - グリフ文字だった記号のパス化: `school`（文）・`temple-sym`（卍）・`hotspring`/`hotspring-sym`（湯気3本＋湯船の弧）・`airport`（飛行機シルエット）・`postoffice`（circle＋〒）
  - 2色塗りだった `station`（黒地に白窓）は evenodd の窓抜きで単色化、`postoffice` は線画（strokeOnly）に変更（SymbolDef が単色前提のため）
- **影響**: 記号の見た目が v1 と一部異なるが、catalog の ID・名前・スタイル値は不変。レンダラ（M3）・SVG ライター（M9）は SYMBOL_PATHS を参照するだけなので影響なし。

### 2026-07-05 M3: 開発用エディタルート `/dev/editor` の追加（親エージェント承認済み）

- **対象M**: M3
- **問題**: `/edit/:mapId` は M2 の `RequireAuth` で保護されているため、Google OAuth 設定なしでは M3 のレンダリングパイプライン（`?seed=demo` 投入・ズーム全域・パターン充填等）を手早く目視検証できない。
- **採った代替案**: `apps/web/src/app/router.tsx` に `import.meta.env.DEV` のときのみ有効な非認証ルート `/dev/editor` を追加した。中身は `/edit/:mapId` と同じ `EditorPage`（`mapId` パラメータが無い場合は `"dev-local"` を使う）。クエリ `?seed=demo` で代表オブジェクト22個（全geom・道路casing・鉄道枕木・破線・パターンエリア3種・点記号7種・admin・text）を投入し、`?s=0.05` 等で初期スケールを指定できる。本番ビルドでは `import.meta.env.DEV` が false になりルート自体が生成されないため、認証バイパスが本番に漏れる心配はない。
- **影響**: `/edit/:mapId`（本番ルート）は従来どおり `RequireAuth` 配下で保護されたまま。`/dev/editor` は開発・検証専用で、mapId のサーバー同期は行わない（M3時点はどちらのルートもローカル MapDoc のみで動作し、M7で MapProvider に置き換わる想定）。

### 2026-07-05 M3: MapDoc に `upsertLayer` を追加（実装書 API 一覧からの拡張）

- **対象M**: M3
- **問題**: 実装書 §2.3 の `MapDoc` API 一覧には `upsertObject`（オブジェクト用）はあるが、レイヤー用の対称メソッドが無い。`seedLocalDefaults` は `DEFAULT_LAYERS`（固定id: terrain/water/…）をそのまま投入する必要があるが、`addLayer(name)` は `crypto.randomUUID()` で新規idを発番する設計のため固定idの投入に使えない。
- **採った代替案**: `upsertObject` と対称な `upsertLayer(layer: Layer): void` を追加し、`addLayer`・`seedLocalDefaults` の内部実装はこれに委譲する形にした。既存の公開APIの意味は変えていない（追加のみ）。
- **影響**: 後続M（M5のLayerPanel等）が `upsertLayer` を使ってよい。実装書のMapDoc API一覧は本エントリを参照の上、追記が望ましい（本エージェントはdocs/v2-implementation.md本文は不変更のスコープ外としたため、ここに記録のみ行う）。

### 2026-07-17 M5: `MapDoc.updateObject` のパッチ型を `exactOptionalPropertyTypes` 対応に拡張

- **対象M**: M5
- **問題**: `MapDoc.updateObject` の既存コメントは「undefined 値のキーはフィールド削除」と明記しているが、実装済みのシグネチャ `patch: Partial<MapObject>` では `exactOptionalPropertyTypes: true` の下で `{ styleOverride: undefined }` のような明示的なフィールド削除パッチが型エラーになる（`Partial<T>` の optional プロパティは値として `undefined` を許容しない）。PropertiesPanel の「スタイルをリセット」（`styleOverride` 削除）・ラベル名クリアで実際にこの操作が必要になった。
- **採った代替案**: `apps/web/src/editor/doc/MapDoc.ts` の `updateObject` のパッチ型を `{ [K in keyof MapObject]?: MapObject[K] | undefined }` に変更（実装ロジックは無変更）。呼び出し側の挙動・既存呼び出し箇所への影響はない（型のみの拡張）。
- **影響**: なし。以降のM（M6のテキスト編集など）でも同様にフィールド削除パッチを型エラーなく渡せる。

### 2026-07-17 M5: `ratioToS`（scaleToRatio の逆関数）を packages/shared に追加せず web 側に暫定実装

- **対象M**: M5
- **問題**: LayerPanel の minS/maxS 編集 UI（「1:5万〜1:1千」のような縮尺セレクト）は、ユーザーが選んだ縮尺表記（比率）から内部の `s`（px/m）値を逆算する必要があるが、`packages/shared/src/geometry/coords.ts` にあるのは `scaleToRatio(s): string` のみで逆関数が存在しない。実装書のやらないこと指定により `packages/shared` の変更は本マイルストーンのスコープ外。
- **採った代替案**: `apps/web/src/editor/ui/LayerPanel.tsx` に `ratioToS(ratio: number): number`（`scaleToRatio` と同じ `SCREEN_DPI=96` / `METRES_PER_INCH=0.0254` 定数を使う逆算）をローカル定義した。プリセット比率 17 段階＋「無制限」で minS/maxS を選択する UI にした。
- **影響**: 定数の重複（`SCREEN_DPI`/`METRES_PER_INCH`）が `coords.ts` と `LayerPanel.tsx` の2箇所に存在する。将来 `packages/shared` に `ratioToS` を追加した際は `LayerPanel.tsx` 側のローカル実装を差し替えること。

### 2026-07-17 M7: WebSocket ハンドシェイクは `x-e2e-user` ヘッダを運べない（Cookie フォールバックを追加）

- **対象M**: M7
- **問題**: 実装書 §5・検証手順は「E2E_TEST_MODE の `x-e2e-user` ヘッダが Playwright の `extraHTTPHeaders` で WS upgrade にも乗る」ことを前提にしている。しかし本環境（Playwright 1.61 + Chromium）で実測したところ、ブラウザの `new WebSocket(url)` は JS からカスタムヘッダを設定できず、`browser.newContext({ extraHTTPHeaders })` も WS ハンドシェイクには適用されない（vite proxy 経由・Worker 直叩きの両方で `GET /api/maps/:id/ws` が 401 になることを確認。`page.on("websocket")` 併用でも同様）。通常の `fetch`/XHR（`GET /api/me` 等）には正しく適用されていたため、WS 固有の制限。
- **採った代替案**: `apps/worker/src/middleware/session.ts` の `requireUser` に Cookie フォールバックを追加した。E2E_TEST_MODE 有効時、`x-e2e-user` ヘッダが無ければ Cookie `e2e-user` を見る（`hono/cookie` の `getCookie`）。Cookie はブラウザが同一オリジンの全リクエスト（WS ハンドシェイク含む）に自動送信するため、Playwright 側は `context.addCookies([{ name: "e2e-user", value: email, url: "http://localhost:5173" }])` で E2E ログインを成立させられる。ヘッダ方式（`fetch` 経路）は変更せず残した。
- **影響**: M10 の Playwright E2E 実装時は、WS を伴うシナリオ（2コンテキスト同時編集等）では Cookie 方式を使うこと。ヘッダのみに依存する現状の記述（§5 のコメント）は将来 `docs/v2-implementation.md` 側の追記が望ましいが、本エージェントは実装書本文を不変更のスコープとしたためここに記録のみ行う。本番では E2E_TEST_MODE 自体が未設定のため影響なし。

### 2026-07-17 M8: 共有リンク・閲覧専用モード（実装・検証まとめ）

- **対象M**: M8
- **実施内容**: §2.5 の links 3本（`GET/POST /api/maps/:id/links`, `DELETE /api/maps/:id/links/:token`）を `apps/worker/src/routes/links.ts` に、`GET /api/share/:token` を `apps/worker/src/routes/share.ts` に実装。`resolveRole`（`apps/worker/src/middleware/session.ts`）に `?t=` トークン検証を追加し、token 判定ロジックは D1 非依存の純関数 `decideRoleFromLink` に切り出してユニットテスト（`session.test.ts`: 有効 edit/view・失効・別マップ token・link 無しの5ケース）を追加した。`GET /api/maps/:id` も `?t=` を受け付けるよう修正（従来は token 未使用で view/edit リンク経由のメタ取得ができなかった）。PATCH/DELETE `/api/maps/:id` は元から token を一切読まない実装だったため、edit リンク越しでも owner 限定のままであることを確認した。web 側は `ShareDialog.tsx`（発行・コピー・失効）、`/s/:token` の `SharePage.tsx`（未ログイン→`/login?redirect=`→ログイン後に復帰、`GET /api/share/:token`→`sessionStorage`保存→`/edit/:mapId`）、`lib/shareToken.ts`（sessionStorage ラッパ）を新設。閲覧専用モード仕上げとして `ToolBar.tsx`（role=view で「選択」ツールのみ表示）・`PropertiesPanel.tsx`/`LayerPanel.tsx`（`<fieldset disabled>` で読み取り表示化）を変更した。
- **実装書からの小さな拡張（承認不要な範囲と判断）**: (1) `RequireAuth.tsx` の認証判定ロジックを `auth/useAuthState.ts` に抽出し `SharePage.tsx` と共用した（振る舞いは不変、重複排除のみ）。(2) `LayerPanel.tsx` にも role=view の読み取り専用化を適用した（実装書の該当箇条は ToolBar/PropertiesPanel のみ明記だが、レイヤーの追加・削除・並べ替え・ロック切替を view ロールに開放したままにすると「読み取り専用」の趣旨に反するため、閲覧専用モード仕上げの一部として含めた）。
- **M7 残検証の消化**: 実装書が M7 で「機構のみ入れ、仕上げは M8」としていた view ロールのサーバー強制を、Playwright で実ブラウザから検証した。閲覧リンクで参加したユーザーのブラウザコンソールから `new WebSocket(...)` で MapRoom へ直接接続し、`[messageType=0(SYNC), syncType=2(UPDATE), payload]` 相当のバイナリを送信したところ、サーバーから `{"type":"error","code":"readonly"}` が返り（`MapRoom.sendReadonlyError`）、送信元以外へのブロードキャストも発生せず、オーナー側の画面・レイヤーオブジェクト数に変化が無いことを確認した（`apps/worker/src/rooms/MapRoom.ts` の `webSocketMessage` 内 `role === "view"` 分岐が意図どおり機能している）。
- **検証手順の詳細**: `pnpm dev` でローカル起動、Playwright（`playwright` パッケージを直接 import する一時スクリプト。`e2e/` は M10 未着手のため正式な e2e ランナーは無い）で (1) オーナーA作成→編集リンク発行→別ユーザーBが`/s/:token`経由参加→Bの描画が数百ms以内にAへ反映（awarenessカーソルも表示）、(2) 閲覧リンクで参加したCはToolBarボタン数が1（選択のみ）・「閲覧専用」バッジ表示・共有ボタン非表示・上記WS注入がサーバー側で拒否、(3) A がリンクを失効→別ユーザーDの新規`/s/:token`アクセスが「リンクが無効です」ページ、(4) token無しの別ユーザーEが`/edit/:mapId`直叩きで「アクセス権がありません」ページ、を確認。スクリーンショットは `/tmp/m8-shots/01〜11-*.png`（検証環境の一時ディレクトリ。リポジトリには含めない）。あわせて curl で `GET/POST/DELETE /api/maps/:id/links`・`GET /api/share/:token`・失効後404・PATCH owner限定403 を確認した。
- **影響**: なし（実装書の仕様どおり）。`pnpm check`（type-check + vitest 97件）・`pnpm build` はともに緑。

### 2026-07-17 M9: PNG エクスポートは `extract.image({ target: container, frame })` ではなく明示 `RenderTexture` 経由に変更

- **対象M**: M9
- **問題**: 実装書 M9-2 は「範囲 bbox から RenderTexture（サイズ=bbox×倍率）に worldRoot を描画 → `renderer.extract.image()`」としているが、最初の実装（`PixiApp.exportRegionToDataUrl`）は `renderer.extract.image({ target: this.worldRoot, frame: new Rectangle(0,0,w,h), clearColor })` という「Container を target にして frame で範囲を切り出す」簡略版で書いた。Playwright での実機検証で、ダウンロードした PNG が完全に空（紙色一色、オブジェクトが一切写らない）になることを発見した。SVG エクスポート・Pixi 画面上の表示は正しかったため、PNG パイプライン固有の不具合と判明。原因は、`extract` に Container を渡した場合の `frame` オプションが、対象 Container 自身の transform 適用結果ではなく「target 自身のローカル座標系」を基準に解釈されるため、`exportRegionToDataUrl` 内で一時的に差し替えた `worldRoot.position`/`scale`（bbox を原点合わせする変換）が抽出結果に反映されないことだった。
- **採った代替案**: 実装書の記述どおり、明示的な `RenderTexture.create({ width, height })` を用意し、`renderer.render({ container: this.worldRoot, target: renderTexture, clearColor })` で焼き込んでから `renderer.extract.image({ target: renderTexture })` する方式に書き直した（`apps/web/src/editor/canvas/PixiApp.ts`）。worldRoot の position/scale 差し替え・復元ロジックは変更なし。
- **影響**: PNG エクスポート・サムネイル生成（`apps/web/src/export/thumbnail.ts` が同じ `exportRegionToDataUrl` を再利用）の両方に影響していたバグを修正。修正後の型チェック・vitest（115件）・ビルドはすべて緑。**ただし本セッション終盤で Bash ツールのネットワークアクセス系コマンド（curl・Playwright 経由の chromium 起動・Monitor 等）が継続的に "temporarily unavailable" で拒否される状態になり、修正後の PNG を実ブラウザで再ダウンロードして目視確認することができなかった**。代わりに (1) Pixi v8 の型定義（`ExtractSystem`/`AbstractRenderer.render`）を確認し `renderer.render({ container, target, clearColor })` と `extract.image({ target: texture })` の型が仕様と一致することを確認、(2) 同修正前の状態で PNG が完全に空になることは実機で確認済み、(3) SVG・.fmap エクスポート・.fmap インポートroundtrip・パターン充填・鉄道枕木・破線・点記号・付随ラベルは同一の Playwright セッションで実機確認済み、という間接的な根拠で妥当性を判断した。次回セッションでツールが復旧し次第、`pnpm dev` 起動後に ExportDialog から PNG をダウンロードして黒/白一色でないことを目視確認することを推奨する。

### 2026-07-18 M10: E2E 検証の環境修正2件（テスト側の不具合。アプリ変更なし）

- **対象M**: M10
- **問題**: (1) 新規 worktree では `apps/web/dist` が存在せず、wrangler の `assets.directory` 検証で `wrangler dev` が起動失敗 → Playwright の webServer が立たず全 E2E が ERR_CONNECTION_REFUSED。(2) `e2e/04-fmap-roundtrip` の「大河川」描画座標が負値で、要素相対クリックがキャンバス左外（カタログパネル）に落ちて intercept されタイムアウト。
- **採った代替案**: (1) `apps/worker/package.json` の `dev` を `node -e "fs.mkdirSync('../web/dist',{recursive:true})" && wrangler dev` に変更（クロスプラットフォームで dist を自動作成）。(2) テスト座標を要素内の正値に修正。
- **影響**: なし（開発体験の改善のみ）。修正後 E2E 4/4 PASS（18.7s）。

### 2026-07-18 M10: 性能検証 — ズーム時再構築ストームの解消と、②フレーム基準の環境限界

- **対象M**: M10（§3.3 の実装調整。実装書 M10-2 の「未達なら調整し記録」に基づく）
- **問題**: 5,000オブジェクト計測で ②パン・ズーム中 342ms/frame と大幅未達。プロファイルの結果、`PixiApp.onScaleChange` が**ズームの毎tickで全 line（2,000本）＋全パターンエリアを再構築**していたことが主因。さらに切り分けの結果、検証環境（ヘッドレスVM）の WebGL が SwiftShader（ソフトウェアラスタライザ）であり、**22オブジェクトでも 26.4ms/frame** と、②の 18ms 基準はこの環境では原理的に達成不能であることが判明した。
- **採った対策**（アプリ側。実GPUでも効く正規の修正）:
  - パターン充填: 再構築をやめ `TilingSprite.tileScale` をその場更新（`PixiApp.patternSprites` 参照キャッシュ）
  - line 幅クランプ: `effectiveLineWidth`（renderers/line.ts からエクスポートし単一ソース化）の前回値をキャッシュし、**5%以上変化した line だけ** 120ms トレーリングで再構築。ズームイン域では実効幅が `style.w` で不変のため再構築ゼロ
  - `applyVisibilityAll` のビューポート計算を全件走査で1回に集約（従来はオブジェクトごとに計算）
  - 効果: SwiftShader 環境で 342ms→252ms。環境フロア（26ms@22obj）に対しアプリ起因分は大幅減
- **②基準の扱い**: `scripts/perf-measure.mjs` に GL レンダラ検出を追加し、SwiftShader/llvmpipe 検出時は ② を「参考値（REF）」としてゲート判定から除外する（①③は従来どおり必須）。**②の正式判定は実GPUのブラウザでの再計測が必要**（ユーザータスク: Windows PC 等で `pnpm dev` → `pnpm e2e:perf`）。
- **影響**: ズーム操作の体感が全環境で改善。①=PASS（buildAll 722〜820ms）③=PASS（1.0〜1.6ms）は環境非依存で達成済み。
