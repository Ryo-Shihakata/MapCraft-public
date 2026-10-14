# MapCraft — Claude 指示書

## 状態

**v2（全面再構築版）完成**。v1（Pixi v7 + Supabase）は削除済み（git 履歴の `5f4be9b` が最終）。
M0〜M10 の全マイルストーンが完了し、E2E・性能検証込みでリリース可能な状態にある。

- **正式ドキュメント**: `docs/v2-plan.md`（計画書）と `docs/v2-implementation.md`（実装書。詳細仕様・M0〜M10・DoD・検証ゲート）
- **逸脱ログ**: `docs/v2-decisions.md`（仕様どおり実装できなかった事情・代替案・実測結果を記録）
- 機能追加・大きな変更は**まず `docs/v2-implementation.md` の該当箇所を読んでから**行うこと。仕様と実装が食い違う場合は decisions.md に該当エントリがないか確認する。本ファイルは要点のみ。

## プロジェクト概要

国土地理院地図記号準拠の架空世界地図を、複数人でリアルタイム共同編集できる公開Webアプリ。

## 技術スタック

| 役割 | 技術 |
|------|------|
| フロントエンド | React 19 + TypeScript strict + Vite + Tailwind CSS v4 |
| 描画エンジン | **Pixi.js v8**（v7 の API は使用禁止。実装書 §3.1） |
| 地図データ | **Y.Doc（Yjs）が単一情報源**。UI状態のみ Zustand |
| 同時編集 | Yjs + Durable Objects（1マップ=1DO、WS hibernation。実装書 §4） |
| バックエンド | Hono on Cloudflare Workers（静的アセットも同一Worker） |
| DB | D1（メタデータ）+ DO SQLite（地図データ）+ R2（サムネイル） |
| 認証 | better-auth（Google OAuth）。**Supabase は廃止済み** |
| E2E / 性能検証 | Playwright（`e2e/` / `scripts/perf-measure.mjs`） |
| モノレポ | pnpm workspaces: `apps/web` / `apps/worker` / `packages/shared` |

## リポジトリ構成

```
apps/
├── web/src/
│   ├── app/            # ルーター・EditorPage（/edit/:mapId・/dev/editor）
│   ├── auth/            # ログインページ・セッションフック
│   ├── dashboard/        # マップ一覧・.fmap インポート
│   ├── editor/
│   │   ├── canvas/       # PixiApp・renderers/{line,area,rect,symbol,text}・PatternRegistry
│   │   ├── tools/         # ToolManager・drawTool・selectTool・hitTest・snap
│   │   ├── doc/           # MapDoc（Y.Doc ラッパ）・provider（WS）・awareness
│   │   ├── ui/            # TopBar/ToolBar/CatalogPanel/PropertiesPanel/LayerPanel/…
│   │   └── state/         # uiStore / viewStore（Zustand）
│   ├── export/            # PNG / SVG(svgWriter) / .fmap
│   └── dev/               # SymbolGallery（/dev/symbols、DEVビルドのみ）
└── worker/src/
    ├── auth.ts             # better-auth 設定（1ファイルに隔離）
    ├── db/                 # drizzle スキーマ・クエリ
    ├── routes/             # maps / links / share / thumbnails
    ├── rooms/MapRoom.ts    # Durable Object（update レベル API のみ）
    └── middleware/session.ts  # requireUser / resolveRole（E2E_TEST_MODE 分岐含む）
packages/shared/src/
├── types.ts / catalog.ts / symbolPaths.ts / fmap.ts
└── geometry/               # coords / snap / curve / dash / sleepers / polygon
e2e/                        # Playwright E2E（4シナリオ）
scripts/perf-measure.mjs    # 性能検証（5,000オブジェクトシード）
```

## 開発コマンド

主作業環境は開発VM（Ubuntu、`~/dev/projects/Map-Creator`）。GitHub: `Ryo-Shihakata/MapCraft`。

```bash
pnpm install
pnpm dev             # web=5173, worker=8787（/api は proxy、ws:true）
pnpm check           # type-check + vitest（全変更の最低ゲート）
pnpm build           # shared → web → worker
pnpm db:migrate:local   # D1 ローカルマイグレーション
pnpm e2e             # Playwright E2E（要: .dev.vars に E2E_TEST_MODE=1、db:migrate:local 済み、pnpm dev 起動）
pnpm e2e:perf        # 性能検証（/dev/editor?seed=perf、要: pnpm dev 起動）
```

初回セットアップの詳細（Cloudflare リソース作成・Google OAuth・.dev.vars）は [SETUP.md](./SETUP.md) 参照。

Windows PC で作業する場合は `C:\dev\projects\Map-Creator`、Node が PATH にない場合は `$env:PATH = "C:\Program Files\nodejs;$env:PATH"`、pnpm は `C:\Users\<user>\AppData\Roaming\npm\pnpm.cmd`。

## 設計上の絶対則

- **地図データの読み書きは `MapDoc`（Y.Doc ラッパ）経由のみ**。コンポーネントから Y.Doc を直接触らない
- **描画と SVG 出力の両方が使うもの**（ジオメトリ計算・記号定義）は `packages/shared` に置き、Pixi 非依存の純関数にする
- **記号形状は `symbolPaths.ts` の SVG パス文字列が単一ソース**（Pixi は `GraphicsPath`、SVG 出力は `<path d>` で同じ定義を参照。両者が食い違うことは構造的に起きない）
- **Pixi v8 の作法を厳守する**（v7 との API 差分は大きい。実装書 §3.1）: `new Application(); await app.init(...)` の2段階初期化、`g.moveTo().lineTo().stroke({...})` のビルダー式（`beginFill`/`lineStyle` は存在しない）、破線は自前分割（native dasharray 無し）。実装前に v8 公式ドキュメントで正確なシグネチャを確認すること
- **Durable Object（MapRoom）は Y.Doc をインスタンス化しない**。update バイナリの merge/diff のみで応答する（hibernation 両立のため。実装書 §4.2〜4.3）
- **座標系**: 1 world unit = 1m、スナップ半径 14 screen px 固定、点記号サイズ screen px 固定
- **`E2E_TEST_MODE` を本番に置かない**。ローカル/E2E専用のログインバイパス（`x-e2e-user` ヘッダ or `e2e-user` Cookie）。`wrangler secret` には絶対に設定しない
- `exactOptionalPropertyTypes: true` / `verbatimModuleSyntax: true`。`any` 禁止（外部境界は zod でパース）

## 環境変数

`apps/worker/.dev.vars`（gitignore。テンプレは `.dev.vars.example`）: `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` / `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `E2E_TEST_MODE=1`（ローカル・E2E専用）。フロント側に環境変数は不要（API は同一オリジン相対パス）。

## E2E / 性能検証（M10）

- `e2e/`（Playwright、`pnpm e2e`）: ①描画→リロード→残存 ②2コンテキスト同時編集 ③閲覧リンク→編集UI無効 ④.fmapエクスポート→インポート→オブジェクト数一致。認証は `e2e-user` Cookie 方式（ヘッダは WS ハンドシェイクに乗らないため。`docs/v2-decisions.md` M7 参照）。
- デバッグフック `window.__mapcraft`（`apps/web/src/editor/ui/EditorLayout.tsx`）は `import.meta.env.DEV` のときのみ存在し、E2E・性能計測がオブジェクト数取得・単体オブジェクト更新に使う。本番ビルドでは tree-shake で消える。
- `scripts/perf-measure.mjs`（`pnpm e2e:perf`）: `/dev/editor?seed=perf` で5,000オブジェクト（線2,000/エリア1,500/記号1,000/テキスト500、50km四方）を投入し、初期表示・パンズーム中の平均フレーム時間・単体オブジェクト再描画時間を計測する。基準値・実測結果は `docs/v2-decisions.md` の M10 エントリを参照。

## Git 規約

Conventional Commits（例: `feat(M10): E2E ランナー整備`）。マイルストーン完了ごとにコミット。push はユーザー指示時のみ。
