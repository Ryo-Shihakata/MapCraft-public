# MapCraft 設計書

**バージョン**: 2.0  
**作成日**: 2026-06-28  
**旧設計書**: `fantasy-map-design.md`

---

## 1. プロジェクト概要

### 1.1 目的

空想世界（ファンタジー・架空国家・創作地理）の地図を、国土地理院地図に準拠したデザインで作成できるWebアプリ。

### 1.2 技術スタック

| 役割 | 採用技術 | 旧設計からの変更点 |
|------|---------|-----------------|
| 描画エンジン | Pixi.js v7 (WebGL) | SVG → Canvas/WebGL (パフォーマンス向上) |
| 状態管理 | Zustand | useState/useMemo → Zustand |
| バックエンド | Hono on **Cloudflare Workers** | Fly.io → Workers (コストゼロ) |
| ホスティング | **Cloudflare Pages** + Workers | Vercel + Fly.io → CF統一 |
| 同時編集 | Phase 2 (Yjs) | MVP では省略 |

---

## 2. アーキテクチャ

```
[ブラウザ]
  React UI (TopBar / CatalogPanel / LayerPanel / StatusBar)
  + Pixi.js Canvas (地図描画)
  Zustand (mapStore / uiStore / viewStore)
        ↓ HTTPS
[Cloudflare Pages] ← 静的アセット配信
        ↓ /api/*
[Cloudflare Workers (Hono)]
  - 認証 (Supabase JWT 検証)
  - マップ CRUD (/api/maps)
        ↓
[Supabase (PostgreSQL + Auth)]
  maps テーブル    ← メタデータ
  map_data テーブル ← 地図コンテンツ (JSONB)
```

---

## 3. 座標系

- **1 ワールドユニット = 1 メートル**
- 原点: キャンバス中央
- X軸 = 東方向、Y軸 = 南方向

### ビュートランスフォーム

```
vt = { x: number, y: number, s: number }
  x, y: 平行移動量 (スクリーンpx)
  s:    スケール係数 (px/m)

// Screen → World
wx = (sx - vt.x) / vt.s
wy = (sy - vt.y) / vt.s

// World → Screen
sx = wx * vt.s + vt.x
sy = wy * vt.s + vt.y
```

### ズームレンジ

| スケール (s) | 縮尺 | 表示幅 (1280px) |
|------------|------|----------------|
| 0.002 | 約 1:4,720,000 | 約 640km |
| 0.1   | 約 1:94,400    | 約 12.8km |
| 1.0   | 約 1:9,440     | 約 1.28km |
| 12.0  | 約 1:790       | 約 107m |

---

## 4. データモデル

→ 詳細は `packages/shared/src/types.ts` を参照

### MapObject

```typescript
interface MapObject {
  id: string;
  geom: "line" | "area" | "admin" | "rect" | "point";
  pts?: Point[];      // 頂点列 (line/area/admin/rect)
  pt?: Point;         // 単一座標 (point)
  style: StyleDef;
  item: CatalogItem;
  name?: string;      // 行政区分ラベル
  parentId?: string;  // 親行政区分ID
  mode?: "straight" | "curve";
  layerId?: string;
  locked?: boolean;
  visible?: boolean;
  createdAt: number;
}
```

---

## 5. 地図要素カタログ

→ 詳細は `packages/shared/src/catalog.ts` を参照

| カテゴリ | 要素数 | 備考 |
|---------|-------|------|
| 道路 | 9種 | 2層描画 (casing + 本線), butt join |
| 鉄道 | 7種 | 枕木自動生成 |
| 水系 | 11種 | 線・エリア・点記号 |
| 植生 | 10種 | エリア |
| 地形 | 15種 | 線・エリア |
| 建物 | 8種 | 矩形・線 |
| 施設（点） | 23種 | SVGパス相当の Pixi.js Graphics |
| 施設（面） | 9種 | エリア |
| 行政境界 | 5種 | 破線 |
| 行政区分 | 3種 | エリア中央にラベル |
| 地図記号 | 18種 | 点記号 |

---

## 6. 描画システム (Pixi.js)

### Zオーダー設計

| Zレンジ | 内容 |
|---------|------|
| 1〜2 | 行政区分 |
| 3〜5 | 地形・植生・水系エリア |
| 6〜14 | 地形線・防波堤・等高線 |
| 15〜18 | 建物・施設面 |
| 19〜25 | 水系線 |
| 30〜50 | 道路 |
| 51〜65 | 鉄道 |
| 67〜72 | 行政境界 |
| 80〜 | 点記号・ラベル |

### コンテナ構成

```
PixiApp.stage
  ├── gridContainer        グリッド (スクリーン空間 / view変更時に再描画)
  └── worldContainer       [vt変換適用]
        ├── sceneContainer   エリア+線形を z 順で単一 Graphics に描画
        │                    (map変更時のみ再構築 / 幅はワールド比例)
        ├── pointContainer   点記号・行政ラベル
        │                    (map・view変更時に再構築 / サイズはスクリーン固定)
        └── overlayContainer 描画プレビュー・スナップ・選択ハイライト
                             (map・view・ui変更時に再構築)
```

**描画パイプライン分離**: ビュー変更(パン/ズーム)では `worldContainer` の
transform 更新とグリッド/点記号/オーバーレイの再描画のみ行い、重い線/面ジオメトリ
(`sceneContainer`) はワールド比例幅のため再構築不要。オブジェクト編集時のみ
`sceneContainer` を再構築する。

**幅の扱い**: 線幅・ストローク幅はワールド単位(m)で指定し、`worldContainer` の
スケールで画面サイズに変換される(ワールド比例)。点記号・ラベル・スナップ半径は
`px / vt.s` でスクリーン固定。

---

## 7. インタラクション

### ツール

| キー | ツール | 動作 |
|------|--------|------|
| Q | 描画 | アクティブカタログ要素を描く |
| W | 選択 | クリックで選択、頂点ドラッグで変形 |
| E | 削除 | クリックで削除 |
| Tab | モード切替 | 描画中の直線/曲線を切り替え |
| Esc | キャンセル | 描画キャンセル |
| Ctrl+Z | Undo | |
| Ctrl+Y | Redo | |

### パン・ズーム

- Space + ドラッグ / 中ボタンドラッグ → パン
- ホイール → ズーム (マウス位置を中心)

---

## 8. スナップシステム

優先順位 (高→低):
1. **頂点スナップ** — 既存オブジェクトの頂点・線分に吸着
2. **グリッドスナップ** — グリッド格子点に丸める
3. **角度スナップ** — 直前頂点からの方向を固定角度に丸める

スナップ半径: **14スクリーンピクセル固定** (ズームに依存しない)

---

## 9. データ保存

### 自動保存

```
操作 → Zustand 更新 → useDebounce(3000ms) → api.maps.saveData()
```

- `map_data` テーブルに全状態 (objects/layers/viewTransform) を JSONB で保存
- 保存ステータス: "idle" | "saving" | "saved" | "error"

### DBスキーマ

```sql
maps (id, owner_id, name, description, thumbnail, created_at, updated_at)
map_data (map_id, objects JSONB, layers JSONB, view_transform JSONB, updated_at)
```

RLS により owner_id = auth.uid() のみアクセス可。

---

## 10. Phase ロードマップ

| Phase | 内容 |
|-------|------|
| **Phase 1 (MVP)** | 基本描画・編集・認証・クラウド保存 |
| **Phase 2** | エクスポート (.fmap/SVG/PNG)・URL共有・Yjs 同時編集・バージョン履歴 |
| **Phase 3** | カスタムテンプレート・公開ギャラリー・GeoJSON・Git風ブランチ |
| **Phase 4** | AI地形生成・3Dビュー・モバイル |
