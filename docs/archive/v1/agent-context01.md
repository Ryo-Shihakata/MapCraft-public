# MapCraft — Agent Context01

> このファイルはサブエージェントに渡すコンテキスト用。作業前に必ず読むこと。

## プロジェクト概要

- **アプリ名**: MapCraft
- **場所**: `C:\dev\projects\Map-Creator\`
- **目的**: 国土地理院地図記号準拠の架空世界地図を作成できる公開Webアプリ
- **状態**: MVP スキャフォールド完了、Supabase/Cloudflare セットアップ待ち

---

## 技術スタック（確定済み）

| 役割 | 技術 |
|------|------|
| フロントエンド | React 18 + TypeScript + Vite |
| 描画エンジン | **Pixi.js v7 (WebGL)** — SVGではない |
| 状態管理 | **Zustand** (mapStore / uiStore / viewStore) |
| バックエンド | **Hono on Cloudflare Workers** — Node.jsサーバーではない |
| データベース | **Supabase (PostgreSQL)** — Auth内蔵 |
| 認証 | **Google OAuth のみ** (Supabase Auth) |
| ホスティング | **Cloudflare Pages** (web) + **Workers** (api) |
| リポジトリ | pnpm workspaces モノレポ |

---

## ディレクトリ構成

```
C:\dev\projects\Map-Creator\
├── apps/
│   ├── web/src/
│   │   ├── canvas/
│   │   │   ├── PixiApp.ts              ← Pixi Application メインクラス
│   │   │   ├── renderers/
│   │   │   │   ├── renderGrid.ts       ← グリッド描画
│   │   │   │   ├── renderObjects.ts    ← MapObject → Pixi Graphics
│   │   │   │   ├── renderPreview.ts    ← 描画中プレビュー
│   │   │   │   ├── drawLine.ts         ← ポリライン・ポリゴン・枕木
│   │   │   │   ├── drawSymbol.ts       ← 点記号
│   │   │   │   └── style.ts            ← CSSカラー→Pixi変換
│   │   │   └── interaction/
│   │   │       ├── handlePointer.ts    ← 描画・選択・削除・スナップ
│   │   │       └── handleWheel.ts      ← ズーム
│   │   ├── store/
│   │   │   ├── mapStore.ts             ← 地図データ・Undo/Redo・自動保存
│   │   │   ├── uiStore.ts              ← ツール・描画状態・スナップ設定
│   │   │   └── viewStore.ts            ← ViewTransform (ズーム・パン)
│   │   ├── components/
│   │   │   ├── TopBar/TopBar.tsx
│   │   │   ├── CatalogPanel/CatalogPanel.tsx
│   │   │   ├── LayerPanel/LayerPanel.tsx
│   │   │   ├── StatusBar/StatusBar.tsx
│   │   │   └── PixiCanvas/PixiCanvas.tsx
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── DashboardPage.tsx
│   │   │   └── EditorPage.tsx
│   │   └── lib/
│   │       ├── coords.ts               ← 座標変換・スナップ計算・グリッド間隔
│   │       ├── api.ts                  ← Hono API クライアント
│   │       ├── supabase.ts             ← Supabase クライアント
│   │       └── uid.ts                  ← crypto.randomUUID()
│   └── api/src/
│       ├── index.ts                    ← Hono ルート + CORS
│       ├── routes/maps.ts              ← /api/maps CRUD
│       ├── middleware/auth.ts          ← Supabase JWT 検証
│       └── lib/supabase.ts             ← Supabase Admin クライアント
└── packages/shared/src/
    ├── types.ts                        ← 全型定義 (MapObject, StyleDef, Layer, etc.)
    ├── catalog.ts                      ← 国土地理院カタログ 119要素
    └── index.ts                        ← re-export
```

---

## 重要な型定義（packages/shared/src/types.ts）

```typescript
type Geom = "line" | "area" | "admin" | "rect" | "point";

interface MapObject {
  id: string;
  geom: Geom;
  pts?: Point[];       // line/area/admin/rect
  pt?: Point;          // point symbol
  style: StyleDef;
  item: CatalogItem;
  name?: string;       // admin area label
  parentId?: string;
  mode?: "straight" | "curve";
  layerId?: string;
  locked?: boolean;
  visible?: boolean;
  createdAt: number;
}

interface ViewTransform { x: number; y: number; s: number; }
// 座標変換: wx = (sx - vt.x) / vt.s
// 1 world unit = 1 metre
```

---

## APIエンドポイント（apps/api）

| メソッド | パス | 内容 |
|---------|------|------|
| GET  | `/api/maps`        | マップ一覧 |
| POST | `/api/maps`        | 新規作成 |
| GET  | `/api/maps/:id`    | メタデータ + データ取得 |
| PATCH | `/api/maps/:id`   | メタデータ更新 |
| PUT  | `/api/maps/:id/data` | 地図データ保存（自動保存） |
| DELETE | `/api/maps/:id` | 削除 |

全エンドポイントに `authMiddleware` (Supabase JWT) が適用される。

---

## DBスキーマ（Supabase PostgreSQL）

```sql
-- maps: メタデータのみ
maps (id UUID PK, owner_id UUID→auth.users, name TEXT, description TEXT,
      thumbnail TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)

-- map_data: 地図コンテンツ全体を JSONB で保持
map_data (map_id UUID PK→maps, objects JSONB, layers JSONB,
          view_transform JSONB, updated_at TIMESTAMPTZ)

-- RLS: owner_id = auth.uid() のみアクセス可
```

---

## 描画設計

- **Pixi.js が全描画を担当**。Reactは UI パネルのみ。
- `PixiApp` が Zustand を subscribe し、store 変更時に `_render()` 呼び出し
- Zオーダー: エリア(1-5) → 地形線(6-14) → 建物(15-18) → 水系(19-25) → 道路(30-50) → 鉄道(51-65) → 行政境界(67-72) → 点記号(80+)
- **道路**: casing + 本線の2層描画、`LINE_CAP.BUTT` + `LINE_JOIN.MITER`
- **鉄道**: 法線方向に枕木（短い線分）を等間隔で自動生成
- **点記号**: `size` はスクリーンpx固定（ズームしても見た目サイズ一定）、`drawSymbol.ts` で Pixi.Graphics により描画

---

## スナップシステム

スナップ半径: **14スクリーンpx固定**（`SNAP_PX / vt.s` でworld換算）

優先順位:
1. 頂点スナップ（既存オブジェクトの頂点・線分上）
2. グリッドスナップ（`gridInterval(vtS)` で算出したNICEインターバル）
3. 角度スナップ（直前頂点からの方向を stepDeg 刻みに丸める）

---

## Zustand ストア構成

```typescript
// mapStore: 地図データ
{ mapId, mapName, objects, layers, history, historyIndex, saveStatus, isLoading }
// actions: loadMap, saveMap, addObject, updateObject, deleteObjects, undo, redo,
//          toggleLayerVisible, toggleLayerLocked

// uiStore: ツール・描画状態
{ activeTool: "draw"|"select"|"delete", activeItem, selectedIds,
  drawingState: {pts, mode}, snapConfig, cursorWorld }

// viewStore: カメラ
{ vt: ViewTransform }
// actions: setVt, zoom(factor, cx, cy), pan(dx, dy), reset
```

---

## 自動保存

```typescript
// EditorPage.tsx
const [debouncedObjects] = useDebounce(objects, 3000);
// objects が変わって3秒後に api.maps.saveData() を呼ぶ
```

---

## 環境変数

```bash
# apps/web/.env.local
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...

# apps/api (wrangler secret)
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

---

## 開発コマンド

```powershell
# Node.js が C:\Program Files\nodejs にある場合
$env:PATH = "C:\Program Files\nodejs;$env:PATH"
$pnpm = "C:\Users\<user>\AppData\Roaming\npm\pnpm.cmd"

# 依存インストール
cd C:\dev\projects\Map-Creator && & $pnpm install

# ローカル起動 (web=5173, api=8787)
& $pnpm dev

# 型チェック
& $pnpm type-check

# APIデプロイ
cd apps/api && & $pnpm deploy
```

---

## MVPスコープ（実装済み）

- [x] 地図描画（線形・エリア・矩形・点記号・行政区分）
- [x] 直線/曲線切り替え（Tab）
- [x] スナップ（頂点・グリッド・角度）
- [x] レイヤー（表示/非表示・ロック）
- [x] Undo/Redo
- [x] 国土地理院全カタログ（11カテゴリ 119要素）
- [x] Google OAuth 認証
- [x] 自動保存（3秒デバウンス）+ 手動保存
- [x] マップダッシュボード（一覧・作成・削除）

## Phase 2 以降（未実装）

- Yjs リアルタイム同時編集
- エクスポート（.fmap / SVG / PNG / GeoJSON）
- URL共有（閲覧専用）
- バージョン管理（コミット・ブランチ）
- カスタムテンプレート

---

## 注意事項

- `pnpm-workspace.yaml` の `allowBuilds` で esbuild/workerd を許可済み
- `packages/shared` はソースのまま参照（ビルドステップなし、`"main": "./src/index.ts"`）
- Pixi.js v7 を使用（v8 ではない）。API差異に注意。
- Cloudflare Workers 環境は Node.js 互換モード（`nodejs_compat`）で動作
- `exactOptionalPropertyTypes: true` が tsconfig で有効。undefined とのユニオンに注意。
