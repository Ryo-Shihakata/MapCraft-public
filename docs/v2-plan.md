# MapCraft v2 計画書

**版**: 1.0（2026-07-02）
**対象リポジトリ**: `C:\dev\projects\Map-Creator\`
**関連文書**: 実装書 [v2-implementation.md](./v2-implementation.md)（agent用・詳細仕様）

---

## 1. 背景 — なぜ作り直すのか

MapCraft v1（現行実装、約2,900行）は 2026-06-28 に1日で一気に構築された。動作はするが、以下の問題があり**アプリ自体を作り直す**ことを決定した。

| 問題 | 内容 |
|------|------|
| 設計プロセス | 仕様が練られないまま実装が先行した。今回は仕様を完全に固めてから agent に実装させる |
| 機能・UX | 「描く・消す」しかできない。頂点編集・移動・コピー・描画後のプロパティ変更が無く、描き直し強制が最大のストレス |
| アーキテクチャ | 全オブジェクト再描画のレンダラ、JSONB一括保存の永続化など、同時編集や大規模マップに耐えない土台 |
| 技術スタック | Pixi.js v7（旧版）、Supabase + Cloudflare の2プラットフォーム運用、リアルタイム基盤なし |

v1 の資産（国土地理院カタログ116要素、記号描画ロジック、座標・スナップ計算、座標系の実績）は移植して活かす。

## 2. プロダクトビジョン

**国土地理院の地図記号・作図法に準拠した架空世界の地図を、複数人でリアルタイムに共同編集できる公開Webアプリ。**

- 個人の創作（架空都市・架空国家の地図づくり）が主用途
- Figma のように「リンクを渡せば一緒に編集できる」体験
- 完成した地図は PNG / SVG で書き出して共有できる

## 3. 初回リリース（v2.0）スコープ

**全部入り**で行く。段階リリースはしない（マイルストーンごとの検証ゲートで品質を担保する）。

### 含むもの

1. **描画**: 線形・エリア・矩形・点記号・行政区分、直線/曲線（Catmull-Rom）、スナップ（頂点→グリッド→角度）
2. **選択・編集ツール群**（v1からの最重要改善）: 単一/矩形複数選択、オブジェクト移動、頂点編集（移動・追加・削除）、コピー/ペースト/複製、描画後のプロパティ変更
3. **テキスト注記**: 自由配置テキスト＋オブジェクト付随ラベル
4. **描画品質・地図らしさ**: 記号形状のSVGパス単一ソース化、植生・地形のパターン充填、縮尺依存表示、線幅の画面下限クランプ、ラベルの白縁取り
5. **レイヤー**: 表示/非表示・ロック・並べ替え・縮尺範囲
6. **Undo/Redo**: Y.UndoManager（自分の変更のみ。同時編集と整合）
7. **リアルタイム同時編集**: Yjs + Durable Objects、プレゼンス（他ユーザーのカーソル・選択表示）
8. **共有**: 閲覧リンク/編集リンクの発行・失効（リンク共有のみ。ユーザー招待制はなし）
9. **エクスポート**: PNG（範囲・解像度指定）/ SVG / .fmap（ネイティブJSON、インポート対応）
10. **認証・ダッシュボード**: Googleログイン、マップ一覧・作成・削除・改名・サムネイル

### 含まないもの（将来フェーズ）

- GeoJSONエクスポート、ユーザー招待制の権限管理、公開ギャラリー、匿名閲覧、バージョン管理（コミット・ブランチ）、カスタムテンプレート、カスタム記号

## 4. 技術スタック（v1からの変更点）

| 役割 | v1 | **v2** | 変更理由 |
|------|----|--------|---------|
| フロントエンド | React 18 + Vite | **React 19 + Vite + TS strict** | 最新化 |
| 描画エンジン | Pixi.js v7 | **Pixi.js v8**（WebGPU/WebGL） | 高速なGraphics API、GraphicsPathによるSVGパス描画（記号の単一ソース化に必須） |
| 地図データの状態 | Zustand（配列＋履歴スナップショット） | **Y.Doc（Yjs）を単一情報源** | 同時編集の前提。M7以前もローカルY.Docで動かし、同期は「接続するだけ」にする |
| UI状態 | Zustand | **Zustand**（UI状態のみに限定） | 継続。役割を縮小 |
| リアルタイム | なし | **Yjs + Durable Objects**（1マップ=1DO、WebSocket hibernation、DO内SQLiteにupdate log＋スナップショット） | サーバー管理不要・マップ単位の強整合・低コスト |
| バックエンド | Hono on Workers | **Hono on Workers**（静的アセット配信も同一Worker） | 継続。Pages廃止で1デプロイに |
| DB | Supabase (PostgreSQL) | **Cloudflare D1**（メタデータ）+ **DO SQLite**（地図データ） | プラットフォーム一本化。wrangler dev だけでローカル完結 |
| 認証 | Supabase Auth (Google) | **better-auth**（Google OAuth, D1 adapter, Workers上） | Supabase廃止に伴う。1ファイルに隔離し、問題があれば arctic 等での手組みに差し替え可能な構造にする |
| ストレージ | なし | **R2**（サムネイルのみ） | ダッシュボード表示用 |
| スタイリング | 素CSS | **Tailwind CSS v4** | UI刷新の生産性 |
| テスト | なし | **Vitest**（ジオメトリ・カタログ・fmapのユニット）+ **Playwright**（E2Eスモーク） | 検証ゲートの自動化 |
| ホスティング | Pages + Workers | **Workers 単体**（assets binding） | 1デプロイ・1プラットフォーム |
| モノレポ | pnpm workspaces | **pnpm workspaces**（apps/web, apps/worker, packages/shared） | 継続。api → worker に改名 |

**Supabase は廃止する**。移行すべき本番データは無い（v1は未公開）。ディスク上の平文キー問題は、キーローテーションではなく Supabase プロジェクトごと削除して解消する（M10）。

## 5. アーキテクチャ概要

```
┌─ ブラウザ (apps/web) ─────────────────────────────┐
│ React 19 UI（Figma型レイアウト・Tailwind）          │
│ Pixi.js v8 キャンバス（差分再描画・カリング）        │
│ Y.Doc = 地図データの単一情報源                      │
│   ├─ Y.UndoManager（自分の変更のみUndo）           │
│   └─ awareness（カーソル・選択のプレゼンス）        │
└───┬───────────────────────┬───────────────────────┘
    │ HTTPS /api/*          │ WebSocket /api/maps/:id/ws
    ▼                       ▼
┌─ Cloudflare Worker (apps/worker, Hono) ───────────┐
│ 静的アセット配信（web/dist, SPA fallback）          │
│ better-auth（Google OAuth, セッションCookie）       │
│ /api/maps CRUD・共有リンク・サムネイル              │
│ WS入室認可（オーナー or 有効リンク）→ DOへ転送      │
└───┬───────────────┬───────────────┬───────────────┘
    ▼               ▼               ▼
 D1 (メタデータ)   MapRoom DO       R2 (サムネイル)
 users/maps/     （1マップ=1DO）
 map_links       Yjs update log＋スナップショット
                 （DO内SQLite・hibernation対応）
```

データフローの要点:

- **編集**: ローカル Y.Doc への変更 → Pixi が差分再描画（Yjsイベントのキー単位）→ WS で update を DO へ → DO が他クライアントへ配信＆SQLiteへ追記
- **DO は Y.Doc をメモリに持たない**: update レベルAPI（`Y.mergeUpdates` / `Y.diffUpdate`）だけで同期に応答する設計にし、hibernation と両立させる
- **権限**: HTTP・WS入室時に D1 で判定。view ロールのソケットからの doc update はサーバー側で拒否（閲覧専用の強制）

## 6. マイルストーンロードマップ

実装書に各マイルストーンの詳細仕様・DoD・検証手順を定義。**検証ゲートを通過するまで次へ進まない。**

| M | 内容 | 依存 |
|---|------|------|
| M0 | 基盤再編: 旧コード退避、新workspace、wrangler.jsonc（DO/D1/R2/assets）、D1マイグレーション基盤、Tailwind、CI | — |
| M1 | shared: 型定義v2（Y.Docスキーマ対応）、カタログ116要素移植＋監査、記号SVGパス定義、ジオメトリ移植＋ユニットテスト | M0 |
| M2 | 認証＋メタデータ: better-auth（Google）、maps CRUD、ダッシュボード | M0（M1と**並行可**） |
| M3 | 描画基盤: Pixi v8、ビューポート、グリッド、レンダラパイプライン（差分再描画・パターン充填・枕木・casing）、ローカルY.Doc購読 | M1 |
| M4 | 描画ツール: line/area/rect/point/admin、直線/曲線、スナップ、プレビュー | M3 |
| M5 | 選択・編集ツール: 選択・移動・頂点編集・コピペ・プロパティパネル | M4 |
| M6 | テキスト注記: 自由配置テキスト＋付随ラベル | M4（M5と並行可） |
| M7 | リアルタイム同期: MapRoom DO、y-protocol over WS hibernation、永続化、awareness、再接続 | M2 + M5 |
| M8 | 共有: 閲覧/編集リンク発行・失効、権限チェック、閲覧専用モード | M7 |
| M9 | エクスポート: PNG / SVGライター / .fmap入出力、サムネイル | M5（**SVGライターはM1完了後いつでも並行可**） |
| M10 | 品質・リリース: Playwright E2E、性能確認（5,000オブジェクト）、本番デプロイ、Supabase廃止、CLAUDE.md更新 | 全部 |

並行作業の指針: worktree で分離できるのは（M1‖M2）、（M5‖M6）、（M9のSVGライター‖M5〜M8）。それ以外は直列。

## 7. リスクと対策

| リスク | 対策 |
|--------|------|
| Pixi v8 のAPI差分（v7の知識で書くと壊れる） | 実装書に v8 作法（`fill()`/`stroke()`、GraphicsPath、Application.init）を明記。agent は v7 のコードを「形状ロジックの参考」としてのみ使う |
| Yjs×DO の複雑さ（同期プロトコル・hibernation） | DO側は update レベルAPIのみ使用し Y.Doc を持たない設計に固定。M7 の仕様にメッセージ形式・SQLiteスキーマ・圧縮条件まで明記 |
| better-auth の Workers/D1 対応の成熟度 | `auth.ts` 1ファイルに隔離。動かない場合の代替（arctic + 手組みセッション）を実装書に記載 |
| 全部入りスコープの重さ | 検証ゲート必須。M4完了時点＝ローカルで描ける、M7完了時点＝同時編集できる、と各段階で動く状態を保つ |
| SVGエクスポートの再現度 | 記号形状を SVGパス文字列の単一ソース（shared）にし、Pixi描画とSVG出力が同じ定義を参照する構造で原理的にズレを防ぐ |

## 8. 旧ドキュメント・旧コードの扱い

- **旧コード**: M0 で `apps/api`・`apps/web`・`packages/shared` を削除（git履歴に残る）。移植対象は M1/M3 で git 履歴 or 削除前スナップショットから参照
- **旧docs**: M0 で `docs/archive/v1/` へ移動 — `design.md`（v1の設計書）、`fantasy-map-design.md`（v1の母体設計）、`agent-context01.md`（v1のagentコンテキスト。記載の「119要素」は誤記で実数116）
- **CLAUDE.md**: M10 で v2 の内容に全面更新
- 本計画書と実装書が v2 の正式ドキュメント

## 9. ユーザー（人間）側の準備タスク

agent では代行できない作業。M2 着手前までに実施する。

1. Google Cloud Console で OAuth クライアント作成（承認済みリダイレクトURI: `http://localhost:8787/api/auth/callback/google` と本番URL）
2. Cloudflare アカウントで D1 データベースと R2 バケットの作成（または agent が `wrangler d1 create` 等を実行するのを承認）
3. M10 で Supabase プロジェクトの削除
