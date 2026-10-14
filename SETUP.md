# MapCraft セットアップガイド（v2）

ローカル開発から本番デプロイまでの手順です。v1（Supabase 版）は廃止済みで、本ガイドは
Cloudflare（Workers + D1 + R2 + Durable Objects）+ better-auth（Google OAuth）構成を前提とします。
詳細仕様は [docs/v2-implementation.md](./docs/v2-implementation.md) を参照してください。

- [1. 前提ツール](#1-前提ツール)
- [2. クローン・インストール](#2-クローンインストール)
- [3. Cloudflare リソースの作成](#3-cloudflare-リソースの作成)
- [4. Google OAuth の設定](#4-google-oauth-の設定)
- [5. 環境変数（.dev.vars）](#5-環境変数devvars)
- [6. ローカル起動](#6-ローカル起動)
- [7. テスト・E2E・性能検証](#7-テストe2e性能検証)
- [8. 本番デプロイ（Cloudflare）](#8-本番デプロイcloudflare)
- [9. トラブルシューティング](#9-トラブルシューティング)

---

## 1. 前提ツール

| ツール | バージョン | 備考 |
|--------|-----------|------|
| Node.js | 20 以上 | |
| pnpm | 9 以上 | `npm i -g pnpm` |
| Cloudflare アカウント | — | Workers / D1 / R2 / Durable Objects を使用 |
| Google Cloud プロジェクト | — | OAuth クライアント（better-auth 用） |

```bash
node -v   # v20+ を確認
pnpm -v   # 9+ を確認
```

## 2. クローン・インストール

```bash
git clone https://github.com/Ryo-Shihakata/MapCraft.git
cd MapCraft
pnpm install
```

`packages/shared` はビルド不要（`src` を直接参照する pnpm workspace）です。

## 3. Cloudflare リソースの作成

`apps/worker/wrangler.jsonc` にはローカル開発分の設定が既に入っています。本番運用や
新規環境では以下を実行して ID を確認・反映してください（ローカル開発（`--local`）は
リソース未作成でも miniflare のエミュレーションで動作します）。

```bash
cd apps/worker
wrangler login

wrangler d1 create mapcraft            # database_id を wrangler.jsonc の d1_databases に反映
wrangler r2 bucket create mapcraft-thumbnails
```

D1 のスキーマは drizzle 管理です。ローカル用マイグレーションは [6. ローカル起動](#6-ローカル起動) で適用します。

## 4. Google OAuth の設定

1. Google Cloud Console で OAuth 2.0 クライアント ID（ウェブアプリケーション）を作成
2. 承認済みのリダイレクト URI に以下を追加
   - `http://localhost:8787/api/auth/callback/google`（開発）
   - `https://<本番ドメイン>/api/auth/callback/google`（本番）
3. Client ID / Client Secret を控える（[5. 環境変数](#5-環境変数devvars) で使用）

## 5. 環境変数（.dev.vars）

`apps/worker/.dev.vars.example` をコピーして値を埋めます（`.dev.vars` は gitignore 済み）。

```bash
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
```

```dotenv
# apps/worker/.dev.vars
BETTER_AUTH_SECRET=<openssl rand -base64 32 で生成>
BETTER_AUTH_URL=http://localhost:8787
GOOGLE_CLIENT_ID=<Google OAuth クライアントID>
GOOGLE_CLIENT_SECRET=<Google OAuth クライアントシークレット>
E2E_TEST_MODE=1   # ローカル/E2E専用。x-e2e-user ヘッダ or e2e-user Cookie でログインをバイパスできる。
                  # 本番の wrangler secret には絶対に設定しないこと（CLAUDE.md 参照）。
```

フロントエンド（`apps/web`）に環境変数は不要です。API は同一オリジンの相対パス（`/api/...`）で呼び出し、
Vite dev サーバーが `/api` を `http://localhost:8787` へプロキシします（`vite.config.ts`、WebSocket も転送）。

## 6. ローカル起動

D1 のローカルマイグレーションを一度適用してから起動します。

```bash
pnpm db:migrate:local   # apps/worker/drizzle の SQL を D1 ローカルDBへ適用
pnpm dev                # web(5173) + worker(8787) を並列起動
```

- web: http://localhost:5173
- worker: http://localhost:8787（`/api/health` が `{ok:true}` を返せば起動確認OK）

Google OAuth を未設定のまま試したい場合は、開発専用ルート `http://localhost:5173/dev/editor`
（認証不要・ローカル Y.Doc のみで完結。`?seed=demo` で代表オブジェクトを投入）が使えます。
本番ビルドではこのルート自体が生成されません（`import.meta.env.DEV` ガード）。

## 7. テスト・E2E・性能検証

```bash
pnpm check       # type-check + vitest（全変更の最低ゲート）
pnpm build       # shared → web → worker の順に本番ビルド
```

Playwright E2E（`e2e/`）は `pnpm dev` が起動している前提で実行します（`playwright.config.ts` の
`webServer` が未起動なら自動起動もします）。認証は `E2E_TEST_MODE=1` の `e2e-user` Cookie 方式です。

```bash
npx playwright install chromium   # 初回のみ
pnpm db:migrate:local             # D1 ローカルDB未適用ならここで
pnpm e2e                          # 4シナリオ（描画永続化・2窓同時編集・閲覧専用・.fmap往復）
```

性能検証（5,000オブジェクトのシード投入・初期表示/フレーム時間/再描画時間の計測）は
`pnpm dev` を別ターミナルで起動した状態で実行します。

```bash
pnpm e2e:perf
```

## 8. 本番デプロイ（Cloudflare）

```bash
cd apps/worker

# D1 / R2 をリモートに反映
pnpm db:migrate:remote

# 秘匿値の登録（E2E_TEST_MODE は本番に絶対設定しない）
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET

# wrangler.jsonc の vars.BETTER_AUTH_URL に本番URLを設定してから
pnpm build            # ルートから: shared → web(dist) → worker
wrangler deploy       # apps/worker から。assets = ../web/dist
```

静的アセット（`apps/web/dist`）と API は同一 Worker から配信されます（`wrangler.jsonc` の
`assets` + `run_worker_first: ["/api/*"]`）。デプロイ後は本番 URL で Google ログイン→
マップ作成→描画→2窓同時編集→共有→PNG/SVG/.fmap エクスポートのスモークテストを行ってください。

## 9. トラブルシューティング

| 症状 | 原因 / 対処 |
|------|------------|
| ログイン後に戻ってこない | Google OAuth のリダイレクト URI に `/api/auth/callback/google` を登録したか確認 |
| `/api/health` が返らない | `apps/worker/.dev.vars` の作成漏れ、または `wrangler dev` が別ポートで起動していないか確認 |
| D1 関連のマイグレーションエラー | `pnpm db:migrate:local` を再実行。`apps/worker/.wrangler` を削除してから再適用も可 |
| WebSocket が繋がらない（同時編集が反映されない） | Vite の `/api` プロキシに `ws: true` が付いているか（`apps/web/vite.config.ts`） |
| 地図が真っ白 | ブラウザの WebGL 有効化を確認。コンソールの `[PixiApp]` ログでエラーを確認 |
| E2E がログインで詰まる | `apps/worker/.dev.vars` に `E2E_TEST_MODE=1` があるか、`pnpm db:migrate:local` 済みか確認 |

---

不明点は [README.md](./README.md) / [docs/v2-plan.md](./docs/v2-plan.md) /
[docs/v2-implementation.md](./docs/v2-implementation.md) も参照してください。
