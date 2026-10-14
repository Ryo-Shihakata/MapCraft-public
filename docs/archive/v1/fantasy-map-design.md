# 空想地図エディタ 設計書

**バージョン**: 1.0  
**作成日**: 2026-04-04  
**ステータス**: 設計確定・実装進行中

---

## 目次

1. [プロジェクト概要](#1-プロジェクト概要)
2. [システムアーキテクチャ](#2-システムアーキテクチャ)
3. [座標系・縮尺設計](#3-座標系縮尺設計)
4. [データモデル](#4-データモデル)
5. [地図要素カタログ](#5-地図要素カタログ)
6. [描画システム](#6-描画システム)
7. [インタラクション設計](#7-インタラクション設計)
8. [スナップシステム](#8-スナップシステム)
9. [レイヤーシステム](#9-レイヤーシステム)
10. [履歴・Undo/Redo](#10-履歴undoredo)
11. [テンプレートシステム](#11-テンプレートシステム)
12. [行政区分システム](#12-行政区分システム)
13. [エクスポートシステム](#13-エクスポートシステム)
14. [リアルタイム同時編集](#14-リアルタイム同時編集)
15. [インフラ・デプロイ構成](#15-インフラデプロイ構成)
16. [フロントエンドUI設計](#16-フロントエンドui設計)
17. [設定システム](#17-設定システム)
18. [公開プロダクト化の要件](#18-公開プロダクト化の要件)

---

## 1. プロジェクト概要

### 1.1 目的

空想世界（ファンタジー・架空国家・創作地理）の地図を、国土地理院地図に準拠したデザインで作成できるWebアプリケーション。OSM Editor（OpenStreetMap編集ツール）に近い操作感を持ち、複数人がリアルタイムで同時に編集できる。

### 1.2 対象ユーザー

- 小説・TRPGの世界観設計者
- ゲーム開発者（ワールドマップ設計）
- 地図作成を趣味とするクリエイター
- 創作活動における世界設定構築者

### 1.3 主要な設計方針

| 方針 | 内容 |
|------|------|
| 地図準拠 | 国土地理院地図記号に準拠したビジュアル |
| 実寸設計 | 座標単位 = 1メートル。実際の距離感で描ける |
| 描きやすさ最優先 | テンプレート・スナップ・自動補完で負担を最小化 |
| ほぼ無制限ズーム | 0.002〜12 倍（縮尺 1:数百万 〜 1:数十） |
| 同時編集 | CRDT（Yjs）によるリアルタイムマルチプレイ |
| バージョン管理 | Git風のスナップショット・ブランチ・差分表示 |
| 拡張性 | カスタムテンプレートを各カテゴリに追加可能 |

---

## 2. システムアーキテクチャ

### 2.1 全体構成

```
┌──────────────────────────────────────────────────────┐
│   ブラウザ（React SPA）                               │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐            │
│  │ カタログ  │ │ SVGキャンバス│ │ レイヤーパネル│           │
│  │ パネル   │ │ (メイン描画)│ │            │            │
│  └──────────┘ └──────────┘ └────────────┘            │
│  ┌────────────────────────────────────────────────┐  │
│  │ 状態管理 (useState / useMemo / useCallback)     │  │
│  │ Yjs Document（CRDT同期）                        │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
         │ WebSocket (y-websocket)    │ REST API
         ▼                           ▼
┌─────────────────┐       ┌─────────────────────────┐
│ y-websocket     │       │ API Server (Hono/Node.js) │
│ サーバー        │       │ - ユーザー認証            │
│ (Fly.io)        │       │ - マップ管理              │
└─────────────────┘       │ - バージョン管理          │
                          └─────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────┐
              ▼                     ▼                  ▼
     ┌──────────────┐    ┌──────────────────┐  ┌────────────┐
     │ PostgreSQL    │    │ Cloudflare R2     │  │ Redis      │
     │ (Supabase)   │    │ (マップファイル)   │  │ (セッション)│
     │ メタデータ    │    │ SVG/fmap/画像     │  │ キャッシュ  │
     └──────────────┘    └──────────────────┘  └────────────┘
```

### 2.2 フロントエンドスタック

| 技術 | 役割 | 選定理由 |
|------|------|---------|
| React 18 | UIフレームワーク | フック・Concurrent Mode |
| Vite | ビルドツール | 高速HMR |
| SVG (ネイティブ) | 地図描画 | 無限ズーム・DOM操作・エクスポート |
| Yjs | CRDT同期 | 軽量・実績豊富 |
| y-websocket | WebSocket通信 | Yjs公式アダプタ |
| y-indexeddb | オフライン永続化 | ブラウザローカル保存 |

### 2.3 バックエンドスタック

| 技術 | 役割 |
|------|------|
| Node.js + Hono | APIサーバー（軽量・Edge対応） |
| y-websocket server | CRDT同期サーバー |
| PostgreSQL (Supabase) | ユーザー・マップメタデータ |
| y-leveldb | Yjs文書の永続化 |
| Cloudflare R2 | ファイルストレージ（転送費無料） |
| Upstash Redis | セッション・キャッシュ |

---

## 3. 座標系・縮尺設計

### 3.1 ワールド座標

- **単位**: 1 ワールドユニット = 1メートル
- **原点**: キャンバス中央（マップごとに任意設定可能）
- **方向**: X軸 = 東方向、Y軸 = 南方向（SVG標準に合わせた下向き正）
- **精度**: 小数点以下2桁（センチメートル精度）

### 3.2 ビュートランスフォーム

```
スクリーン座標 → ワールド座標 変換:
  wx = (sx - vt.x) / vt.s
  wy = (sy - vt.y) / vt.s

ワールド座標 → スクリーン座標 変換:
  sx = wx * vt.s + vt.x
  sy = wy * vt.s + vt.y

vt = { x: number, y: number, s: number }
  x, y: 平行移動量（スクリーンピクセル）
  s: スケール係数（pixels/meter）
```

### 3.3 ズームレンジ

| スケール (s) | 縮尺 (96dpi想定) | 表示幅（1280px想定） |
|-------------|-----------------|-------------------|
| 0.002 | 約 1:4,720,000 | 約 640km |
| 0.01 | 約 1:944,000 | 約 128km |
| 0.1 | 約 1:94,400 | 約 12.8km |
| 0.5 | 約 1:18,900 | 約 2.56km |
| 1.0 | 約 1:9,440 | 約 1.28km |
| 5.0 | 約 1:1,890 | 約 256m |
| 12.0 | 約 1:790 | 約 107m |

### 3.4 グリッド自動調整

ズームレベルに応じて、グリッド間隔を自動選択する。

```javascript
const NICE_INTERVALS = [
  1, 2, 5, 10, 25, 50, 100, 250, 500, 1000,
  2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000
];

function gridInterval(vtS) {
  const targetPixels = 70; // 目標グリッド間隔（px）
  const worldPerPixel = targetPixels / vtS;
  return NICE_INTERVALS.find(n => n >= worldPerPixel)
      || NICE_INTERVALS[NICE_INTERVALS.length - 1];
}
```

グリッドは細線（補助線）と太線（主目盛り = 補助線×5）の2段階で表示する。パターンの原点はビュートランスフォームと連動して動く。

### 3.5 角度スナップの自動切替

| 表示幅 | スナップ角度 |
|--------|------------|
| 50km 以上 | 45° |
| 50km 未満 | 15° |

ユーザーは個別に角度を選択可能（5°/10°/15°/22.5°/30°/45°/90°）。

---

## 4. データモデル

### 4.1 MapObject（地図オブジェクト）

すべての地図要素はこの形式で保存される。

```typescript
type Geom = "line" | "area" | "admin" | "rect" | "point";

interface MapObject {
  id: string;          // UUID（uid()で生成）
  geom: Geom;          // 図形タイプ
  pts?: Point[];       // 頂点列（line/area/admin/rect）
  pt?: Point;          // 単一座標（point）
  style: StyleDef;     // 描画スタイル
  item: CatalogueItem; // カタログ参照
  name?: string;       // ラベル（行政区分など）
  parentId?: string;   // 親行政区分ID
  mode?: "straight" | "curve"; // 線の種類
  layerId?: string;    // レイヤーID（省略時はitem.cat）
  locked?: boolean;    // 編集ロック
  visible?: boolean;   // 表示フラグ
  createdAt: number;   // タイムスタンプ
  authorId?: string;   // 作成者ID
}

interface Point {
  x: number; // ワールド座標 (m)
  y: number; // ワールド座標 (m)
}
```

### 4.2 StyleDef（描画スタイル）

```typescript
interface StyleDef {
  // 線形・境界線
  stroke?: string;       // 線色（CSS color）
  casing?: string;       // ケーシング色（道路外枠）
  w?: number;            // 線幅（ワールド単位/m）
  dash?: number[];       // 破線パターン [on, off]
  rail?: boolean;        // 鉄道（枕木を自動描画）

  // エリア・矩形
  fill?: string;         // 塗り色
  sw?: number;           // ストローク幅（ワールド単位）

  // 点記号
  sym?: string;          // 記号ID（MapSymコンポーネント参照）
  color?: string;        // 記号色
  size?: number;         // 記号サイズ（スクリーンピクセル基準）

  // レイヤー制御
  z?: number;            // Zオーダー（描画順）
}
```

### 4.3 CatalogueItem（カタログ定義）

```typescript
interface CatalogueItem {
  id: string;           // 一意ID
  name: string;         // 表示名（日本語）
  cat: string;          // カテゴリ名
  geom: Geom;           // デフォルト図形タイプ
  style: StyleDef;      // デフォルトスタイル
  custom?: boolean;     // ユーザー定義フラグ
}
```

### 4.4 Layer（レイヤー定義）

```typescript
interface Layer {
  id: string;       // カテゴリ名と一致（デフォルト）
  name: string;     // 表示名
  visible: boolean; // 表示/非表示
  locked: boolean;  // 編集ロック
  minS: number;     // 最小スケール（表示下限）
  maxS: number;     // 最大スケール（表示上限）
}
```

### 4.5 ViewTransform（ビュー状態）

```typescript
interface ViewTransform {
  x: number; // X平行移動（スクリーンpx）
  y: number; // Y平行移動（スクリーンpx）
  s: number; // スケール（px/m）
}
```

### 4.6 DrawingState（描画中状態）

```typescript
interface DrawingState {
  pts: Point[];              // 確定済み頂点列
  mode: "straight" | "curve"; // 線種
}
```

### 4.7 SnapConfig（スナップ設定）

```typescript
interface SnapConfig {
  vertex: boolean;   // 頂点・線分スナップ
  grid: boolean;     // グリッドスナップ
  angle: boolean;    // 角度スナップ
  angleDeg: number;  // 角度刻み（5/10/15/22.5/30/45/90）
}
```

### 4.8 DBスキーマ（PostgreSQL）

```sql
-- ユーザー
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- マップ
CREATE TABLE maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT false,
  thumbnail_url TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- マップメンバー（共同編集権限）
CREATE TABLE map_members (
  map_id UUID REFERENCES maps(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor', -- 'owner'|'editor'|'viewer'
  PRIMARY KEY (map_id, user_id)
);

-- バージョン（コミット）
CREATE TABLE map_commits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id UUID REFERENCES maps(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES map_commits(id),
  branch TEXT NOT NULL DEFAULT 'main',
  message TEXT NOT NULL,
  author_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 操作ログ（差分）
CREATE TABLE map_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commit_id UUID REFERENCES map_commits(id) ON DELETE CASCADE,
  op_type TEXT NOT NULL, -- 'add'|'update'|'delete'
  object_id TEXT NOT NULL,
  payload JSONB NOT NULL
);

-- スナップショット（高速復元用、N commits毎）
CREATE TABLE map_snapshots (
  commit_id UUID PRIMARY KEY REFERENCES map_commits(id),
  full_state JSONB NOT NULL,
  object_count INTEGER
);

-- テンプレートパック
CREATE TABLE template_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  items JSONB NOT NULL,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 5. 地図要素カタログ

国土地理院地図記号（2022年版）に準拠した全要素一覧。

### 5.1 道路カテゴリ

| ID | 名前 | 図形 | 線幅(m) | Zオーダー |
|----|------|------|---------|----------|
| motorway | 高速道路 | 線 | 14 | 50 |
| national | 国道 | 線 | 10 | 40 |
| prefect | 都道府県道 | 線 | 8 | 30 |
| municipal | 市区町村道 | 線 | 5 | 20 |
| track | 軽車道 | 線(破線) | 3 | 15 |
| footway | 徒歩道 | 線(破線) | 2 | 10 |
| bridge | 橋 | 線 | 8 | 45 |
| tunnel | トンネル | 線(破線) | 5 | 6 |
| steps | 階段 | 線(細破線) | 3 | 12 |

道路の描画は **2層構造**（ケーシング＋本線）で表現する。`strokeLinecap="butt"`, `strokeLinejoin="miter"` で角ばったデザインを維持する。

### 5.2 鉄道カテゴリ

| ID | 名前 | 図形 | 特記 |
|----|------|------|------|
| shinkansen | 新幹線 | 線 | 枕木自動生成 |
| jrline | JR線 | 線 | 枕木自動生成 |
| private | 私鉄 | 線 | 枕木自動生成 |
| monorail | モノレール | 線 | 枕木自動生成 |
| tram | 路面電車 | 線(破線) | |
| cablecar | ケーブルカー | 線(破線) | |
| ropeway | ロープウェー | 線(点線) | |

**枕木描画アルゴリズム**: 線分を等間隔に分割し、法線方向に短い線分を描画する。間隔は線幅×2.2。

### 5.3 水系カテゴリ

| ID | 名前 | 図形 |
|----|------|------|
| ocean | 海・湖 | エリア |
| pond | 池・沼 | エリア |
| river-l | 大河川 | 線 |
| river-m | 中河川 | 線 |
| river-s | 小河川 | 線 |
| canal | 用水路 | 線(破線) |
| ditch | 水路 | 線(破線) |
| coast | 海岸線 | 線 |
| waterfall | 滝 | 点記号 |
| hotspring | 温泉 | 点記号 |
| spring | 泉 | 点記号 |

### 5.4 植生カテゴリ

| ID | 名前 | 図形 |
|----|------|------|
| forest | 森林 | エリア |
| bamboo | 竹林 | エリア |
| palm | ヤシ科 | エリア |
| orchard | 果樹園 | エリア |
| grassland | 草地 | エリア |
| meadow | 牧場 | エリア |
| rice | 水田 | エリア |
| farmland | 畑 | エリア |
| greenhouse | 温室 | エリア |
| scrub | 荒地 | エリア |

### 5.5 地形カテゴリ

| ID | 名前 | 図形 | 備考 |
|----|------|------|------|
| contour | 等高線 | 線 | 細い茶色 |
| contour5 | 計曲線 | 線 | 太い茶色（5本毎） |
| cliff | 崖（岩） | 線 | |
| cliff-soil | 崖（土） | 線(破線) | |
| dike | 土手 | 線 | |
| embankment | 盛土 | 線 | |
| cut | 切土 | 線(破線) | |
| levee | 防波堤 | 線 | ケーシング付き |
| sand | 砂地 | エリア | |
| gravel | 礫地 | エリア | |
| rock | 岩地 | エリア | |
| wetland | 湿地 | エリア | |
| saltflat | 干潟 | エリア | |
| snowfield | 雪・氷河 | エリア | |
| lava | 溶岩 | エリア | |

### 5.6 建物カテゴリ

| ID | 名前 | 図形 |
|----|------|------|
| building | 建物 | 矩形 |
| imp-bld | 重要施設 | 矩形 |
| shrine-bld | 神社・寺建物 | 矩形 |
| ruin-bld | 廃屋 | 矩形(破線) |
| greenhouse-bld | 温室建物 | 矩形 |
| tank | タンク | エリア |
| wall-bld | 塀・垣 | 線 |
| fence | フェンス | 線(破線) |

### 5.7 施設（点）カテゴリ

国土地理院地図記号を SVG パスで再現する。背景円は描画しない。

| ID | 名前 | 記号 |
|----|------|------|
| cityhall | 市区町村役場 | 屋根付き矩形 + 役 |
| prefoffice | 都道府県庁 | 太枠矩形 + 県 |
| police | 警察署 | 矩形 + 警 |
| fire | 消防署 | 矩形 + 消 |
| hospital | 病院 | 太十字 |
| clinic | 診療所 | 細十字 |
| elderly | 老人ホーム | 丸 + 老 |
| school | 学校 | 矩形 + 旗 + 屋根 |
| university | 大学 | 太枠矩形 + 横棒 |
| library | 図書館 | 矩形 + 図 |
| museum | 博物館 | 三角屋根 + 底線 |
| postoffice | 郵便局 | 〒 |
| station | 駅 | 黒矩形 + 白矩形 |
| port | 港 | 錨型 |
| airport | 空港 | ✈ |
| factory | 工場 | 丸 + 煙突×2 |
| power | 発電所 | 三角 + 横線 |
| substation | 変電所 | 矩形 + X |
| chimney | 煙突 | 台形柱 |
| court | 裁判所 | 矩形 + 裁 |
| tax | 税務署 | 矩形 + 税 |
| health | 保健所 | 矩形 + 保 |
| jsdf | 自衛隊 | 丸 + 自 |
| weather | 気象台 | 丸 + 気 |

### 5.8 施設（面）カテゴリ

| ID | 名前 | 図形 |
|----|------|------|
| bld-hospital | 病院建物 | 矩形 |
| bld-school | 学校建物 | 矩形 |
| bld-station | 駅舎 | 矩形 |
| bld-factory | 工場敷地 | エリア |
| bld-airport | 空港敷地 | エリア |
| bld-port | 港湾敷地 | エリア |
| bld-park | 公園 | エリア |
| bld-cemetery | 墓地 | エリア |
| bld-military | 自衛隊敷地 | エリア |

### 5.9 行政境界カテゴリ

| ID | 名前 | 破線 | Zオーダー |
|----|------|------|----------|
| bord-nat | 国境 | 12-6 | 72 |
| bord-pref | 都道府県界 | 8-5 | 70 |
| bord-city | 市区町村界 | 5-5 | 69 |
| bord-ward | 区界 | 4-4 | 68 |
| bord-town | 町丁目界 | 3-4 | 67 |

### 5.10 行政区分カテゴリ

| ID | 名前 | 図形 | 特記 |
|----|------|------|------|
| adm-nat | 国 | admin | 名前をエリア中央に表示 |
| adm-pref | 都道府県 | admin | 名前をエリア中央に表示 |
| adm-city | 市区町村 | admin | 名前をエリア中央に表示 |

### 5.11 地図記号カテゴリ

| ID | 名前 | 記号 |
|----|------|------|
| triangle | 三角点 | 塗りつぶし三角 |
| triangle_e | 電子基準点 | 空三角 + 円 |
| benchmark | 水準点 | 円 + 横線 |
| gnss | GNSS基準点 | 丸角矩形 + 中心点 |
| shrine-sym | 神社 | 鳥居（二重横棒+縦棒） |
| temple-sym | 寺院 | 卍 |
| church-sym | キリスト教会 | 十字 |
| peak | 山頂 | 空三角 + 小円 |
| volcano | 火山 | 空三角 + 噴火弧 |
| lighthouse | 灯台 | 塗り台形 + 横線 |
| dam-sym | ダム | 横長矩形 + 縦線×2 |
| waterfall-sym | 滝 | ≋ |
| mine-sym | 採石地 | 二重三角 |
| chimney-sym | 煙突記号 | 台形 |
| castle-sym | 城跡 | 二重矩形 |
| ruins-sym | 遺跡 | 破線矩形 |
| historic | 史跡 | 円 + 史 |
| cemetery-sym | 墓地記号 | 十字 + 底線 |
| hotspring-sym | 温泉 | 波線×2 + 横線 |

---

## 6. 描画システム

### 6.1 SVGレイアウト

```
<svg> (画面全体)
  └── <PaperBackground> (紙テクスチャ・グリッド)
  └── <g transform="translate(vt.x, vt.y) scale(vt.s)">
        └── エリア群 (z=1〜5, 最背面)
        └── 線形群 (z=6〜67)
        └── 点記号群 (z=68〜)
        └── プレビュー（描画中）
        └── スナップインジケーター
        └── 十字カーソル
```

すべてのオブジェクトは z 値でソートして描画する。

### 6.2 レイヤーZオーダー設計

| Zレンジ | 内容 |
|---------|------|
| 1〜2 | 行政区分（最背面・面） |
| 3〜5 | 地形・植生・水系エリア |
| 6〜14 | 地形線・防波堤・等高線 |
| 15〜18 | 建物・施設面 |
| 19〜25 | 水系線（川・用水路） |
| 30〜50 | 道路系 |
| 51〜65 | 鉄道系 |
| 67〜72 | 行政境界線 |
| 80〜 | 点記号・ラベル（最前面） |

### 6.3 道路描画（2層構造）

```
描画順:
  1. ケーシング層（stroke = casing色、幅 = w + casingSupplement）
  2. 本線層（stroke = 道路色、幅 = w）

角のデザイン:
  strokeLinecap  = "butt"   （角ばった端点）
  strokeLinejoin = "miter"  （角ばった接続）

※ "round" は使用しない（Cities Skylines 2風を避ける）
```

### 6.4 鉄道描画（枕木自動生成）

```javascript
// 各線分を等間隔に分割して枕木を描画
function drawSleepers(pts, style) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i+1];
    const segLen = distance(a, b);
    const stepCount = Math.floor(segLen / (style.w * 2.2));
    for (let k = 0; k < stepCount; k++) {
      const t = (k + 0.5) / stepCount;
      const mx = a.x + t * (b.x - a.x);
      const my = a.y + t * (b.y - a.y);
      const normalAngle = Math.atan2(b.y - a.y, b.x - a.x) + PI/2;
      const halfLen = style.w * 0.75;
      // 法線方向に短い線を描画
      drawLine(
        mx + halfLen * cos(normalAngle), my + halfLen * sin(normalAngle),
        mx - halfLen * cos(normalAngle), my - halfLen * sin(normalAngle),
        { stroke: style.casing, width: style.w * 0.3 }
      );
    }
  }
}
```

### 6.5 点記号描画

すべての地図記号は SVG プリミティブ（line, path, polygon, text）の組み合わせで描画する。背景の円は描画しない。サイズはスクリーンピクセル基準で固定し、ズームしても記号サイズは変わらない（ただし世界座標上での位置は追従する）。

```javascript
// サイズの算出
const screenSize = style.size || 12; // px固定
const worldSize = screenSize / vtS;  // world単位に変換

// transform で位置だけ追従させる
<g transform={`translate(${pt.x}, ${pt.y})`}>
  <MapSym sz={worldSize} ... />
</g>
```

### 6.6 行政区分ラベル

エリアの重心座標にラベルを配置する。

```javascript
const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
```

ラベルは `paintOrder="stroke"` で白縁取りを付け、背景の複雑な地形の上でも視認できるようにする。

### 6.7 プレビュー描画

描画中のプレビューは以下の仕様で描画する。

- 不透明度: 0.7
- 線種: 破線（strokeDasharray: "12 6"）
- 確定済み頂点: 青丸（最初の頂点は大きめ）
- エリア閉じスナップ: 最初の頂点周囲に点線の輪を表示
- 距離バッジ: マウス位置の右上に「距離m · 角度°」を表示

---

## 7. インタラクション設計

### 7.1 ツール定義

| ID | 名前 | ショートカット | 動作 |
|----|------|--------------|------|
| draw | 描画 | Q | アクティブなカタログ要素を描く |
| select | 選択 | W | クリック/Shift+クリックで選択。頂点ドラッグで変形 |
| delete | 削除 | E | クリックしたオブジェクトを削除 |

### 7.2 描画フロー（線形）

```
マウスクリック (1回目)
  → 描画開始。pts = [p0]

マウスクリック (2回目以降)
  → pts.push(pN)

右クリック または ダブルクリック
  → オブジェクト確定
  → 続けて描く場合は pts = [最後の頂点] から再開

Escape
  → 描画キャンセル
```

### 7.3 描画フロー（エリア・行政区分）

```
マウスクリック (1回目)
  → 描画開始。pts = [p0]

マウスクリック (2〜N回)
  → pts.push(pN)

最初の頂点の近く（スナップ圏内）をクリック
または ダブルクリック
  → ポリゴン閉じて確定

行政区分の場合 → 名前入力モーダルを表示
```

### 7.4 描画フロー（矩形）

```
マウスダウン
  → rectStart = wp

マウスムーブ
  → プレビュー矩形を描画

マウスアップ
  → 矩形確定（対角2点から4頂点を生成）
  → 最低3m以上の対角距離が必要
```

### 7.5 選択・変形フロー

```
Wキー → 選択モード

キャンバスクリック
  → ヒットテスト（Z降順で最前面オブジェクトを選択）
  → Shift+クリックで複数選択

選択後、頂点にカーソルを近づける（スナップ圏内）
  → 頂点ドラッグ → 当該頂点を移動

Shift + 頂点ドラッグ
  → 全頂点を同じだけ移動（オブジェクト全体移動）

選択後、辺や内部にカーソルを近づける
  → オブジェクトドラッグ → 全体移動

Deleteキー
  → 選択中オブジェクトをすべて削除
```

### 7.6 コピー・ペースト

```
Ctrl+C → 選択中オブジェクトをクリップボードにコピー
Ctrl+V → 40m/vtSのオフセット付きでペースト
          → 新しいIDを割り当て
          → ペーストされたオブジェクトを自動選択
```

### 7.7 パン（地図移動）

```
スペースキー長押し + ドラッグ → パン
中ボタン（ホイールクリック）+ ドラッグ → パン
ホイール回転 → ズームイン/アウト（マウス位置を中心）
```

### 7.8 ヒットテスト

```
点記号: dst(wp, obj.pt) < snapRadius * 1.8
線形: 各線分に対して closest-on-segment < snapRadius
エリア/矩形/行政区分:
  → 外周の辺へのclost-on-segment < snapRadius
  または 内部判定（point-in-polygon）
```

---

## 8. スナップシステム

### 8.1 スナップの種類と優先順位

優先順位（高い順）:

1. **頂点スナップ** — 既存オブジェクトの頂点に吸着
2. **線分スナップ** — 既存オブジェクトの辺上の最近傍点に吸着
3. **グリッドスナップ** — グリッド格子点に丸める
4. **角度スナップ** — 直前の頂点からの方向を固定角度に丸める

頂点スナップが機能した場合、他のスナップは無視する。

### 8.2 スナップ半径

```
snapRadius (world) = SNAP_PX / vtS
SNAP_PX = 14 (スクリーンピクセル固定)
```

ズームに関わらず常に14px以内でスナップが発動する。

### 8.3 最近傍点アルゴリズム（線分上）

```javascript
function closestOnSegment(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y;
  const len2 = abx*abx + aby*aby;
  if (len2 < 1e-9) return { pt: {...a}, d: distance(p, a) };
  const t = clamp(0, 1,
    ((p.x-a.x)*abx + (p.y-a.y)*aby) / len2
  );
  const pt = { x: a.x + t*abx, y: a.y + t*aby };
  return { pt, d: distance(p, pt) };
}
```

### 8.4 角度スナップアルゴリズム

```javascript
function snapAngle(from, to, stepDeg) {
  const d = distance(from, to);
  if (d < 1) return to;
  const raw = Math.atan2(to.y - from.y, to.x - from.x) * 180 / PI;
  const snapped = Math.round(raw / stepDeg) * stepDeg;
  const rad = snapped * PI / 180;
  return {
    x: from.x + d * Math.cos(rad),
    y: from.y + d * Math.sin(rad)
  };
}
```

### 8.5 グリッドスナップ

```javascript
function snapToGrid(p, interval) {
  return {
    x: Math.round(p.x / interval) * interval,
    y: Math.round(p.y / interval) * interval
  };
}
// intervalはgridInterval(vtS)で取得
```

### 8.6 UI: スナップ個別切替

上部ツールバーに3つのトグルボタンを配置する。線形・エリア描画時のみ表示。

```
[頂点スナップ]  [グリッドスナップ]  [角度 45° ▾]
```

角度は 5°/10°/15°/22.5°/30°/45°/90° のドロップダウンで選択。
表示幅が50km未満のとき自動で15°に切り替わる（ユーザーが手動変更している場合は維持）。

---

## 9. レイヤーシステム

### 9.1 レイヤーの自動分類

オブジェクトの `item.cat`（カタログカテゴリ）がそのままレイヤーIDとして使われる。追加したオブジェクトは自動的に該当レイヤーに所属する。

### 9.2 Zオーダーによる描画順制御

描画は `style.z` でソートされる。エリア系（z=1〜5）が最背面、点記号・ラベル（z=80〜）が最前面。レイヤーの表示/非表示と z オーダーは独立して機能する。

### 9.3 ズームレベル別表示制御

各レイヤーに `minS` / `maxS` を設定する。現在の `vtS` がこの範囲外の場合、そのレイヤーは非表示になる。

```javascript
const isVisible = layer.visible
  && vt.s >= layer.minS
  && vt.s <= layer.maxS;
```

設定UIでユーザーが自由に閾値を変更できる。

### 9.4 レイヤーパネル

右パネルにレイヤー一覧を表示する。

- 表示/非表示ボタン（◉）
- ロックボタン（🔒） — ロック中はオブジェクトを選択/編集不可
- オブジェクト数バッジ
- 「＋ レイヤー追加」— 任意の名前でカスタムレイヤーを追加可能

---

## 10. 履歴・Undo/Redo

### 10.1 ヒストリースタック

```typescript
state = {
  objects: MapObject[],    // 現在の状態
  history: MapObject[][],  // スナップショット配列
  hIdx: number,            // 現在位置
}
```

操作のたびに `pushHistory(newObjects)` を呼び出し、現在位置以降のヒストリーを破棄して新しいスナップショットを追加する。

### 10.2 操作境界

以下の操作でヒストリーが積まれる。

- 線・エリア・矩形・点記号の確定（右クリック/ダブルクリック/マウスアップ）
- 頂点ドラッグ終了（マウスアップ時）
- オブジェクト移動終了（マウスアップ時）
- 削除（クリック即時）
- 複数削除（Deleteキー）
- ペースト（Ctrl+V）
- 行政区分名の保存

### 10.3 キーボードショートカット

| 操作 | ショートカット |
|------|--------------|
| 取り消し | Ctrl+Z |
| やり直し | Ctrl+Y または Ctrl+Shift+Z |

---

## 11. テンプレートシステム

### 11.1 組み込みテンプレート

上述のカタログ（5章）がデフォルトテンプレートとして全ユーザーに提供される。

### 11.2 カスタムテンプレートの追加

「カスタム」カテゴリから「＋ テンプレートを追加」を押してモーダルを開き、以下を設定する。

| 項目 | 選択肢 |
|------|--------|
| 名前 | 任意テキスト |
| 追加先カテゴリ | 既存の全カテゴリ |
| 図形タイプ | 線形/エリア/矩形/行政区分/点記号 |
| 色（輪郭） | カラーピッカー |
| 色（塗り） | カラーピッカー（面のみ） |
| 線幅 | 数値入力（線のみ） |
| 破線 | チェックボックス |

### 11.3 テンプレートパックのエクスポート

カスタムテンプレートのみを `.fmtpl` ファイルとしてエクスポートし、別プロジェクトにインポートできる。

```json
{
  "version": "1.0",
  "name": "中世ファンタジースタイル",
  "items": [
    {
      "id": "custom-trail",
      "name": "古代遺跡への道",
      "cat": "道路",
      "geom": "line",
      "style": { "stroke": "#c0a870", "w": 2, "z": 12, "dash": [6, 4] }
    }
  ]
}
```

---

## 12. 行政区分システム

### 12.1 概念

行政区分は `geom: "admin"` のエリアオブジェクト。通常のエリアと異なり、以下を持つ。

- `name`: 区分名（エリア中央に表示）
- `parentId`: 親区分オブジェクトのID（階層構造）

### 12.2 階層構造

```
国 (adm-nat)
├── 都道府県 (adm-pref)
│   ├── 市区町村 (adm-city)
│   └── 市区町村 (adm-city)
└── 都道府県 (adm-pref)
    └── 市区町村 (adm-city)
```

parentId による親子関係はアプリ側が管理する。物理的なエリアの包含関係は自動検証しない（描き手の責任）。

### 12.3 名前入力フロー

エリアが確定したとき自動的にモーダルが開く。

```
フィールド:
  区分名: [テキスト入力]
  親区分: [ドロップダウン: "なし（最上位）" or 既存のadminオブジェクト一覧]
```

選択ツールで行政区分をクリックしてもモーダルを開ける（名前変更・親変更）。

---

## 13. エクスポートシステム

### 13.1 対応フォーマット

| フォーマット | 拡張子 | 用途 | 状態 |
|------------|--------|------|------|
| SVG（レイヤー付き） | .svg | Illustrator / Affinity 編集 | 実装予定 |
| プロジェクトファイル | .fmap | 全データ保存・再読込 | 実装済み（JSON） |
| PNG（高解像度） | .png | 印刷・配布 | 実装予定 |
| GeoJSON | .geojson | GIS・ゲームエンジン | 実装予定 |
| テンプレートパック | .fmtpl | スタイル共有 | 実装予定 |

### 13.2 .fmap ファイル形式

```json
{
  "version": "1.0",
  "mapName": "エルフィア大陸",
  "createdAt": "2026-04-04T00:00:00Z",
  "viewTransform": { "x": 500, "y": 350, "s": 0.1 },
  "layers": [ ... ],
  "objects": [
    {
      "id": "abc123",
      "geom": "line",
      "pts": [{"x": 0, "y": 0}, {"x": 1000, "y": 500}],
      "style": { "stroke": "#fff", "casing": "#888", "w": 10, "z": 40 },
      "item": { "id": "national", "name": "国道", "cat": "道路" },
      "mode": "straight"
    }
  ],
  "customTemplates": [ ... ]
}
```

### 13.3 SVGエクスポート仕様（実装予定）

- SVGのレイヤー構造: カテゴリごとに `<g id="layer-道路">` として出力
- 座標: ワールド座標そのまま（viewBox で調整）
- フォント: serif 系（Illustrator で再現可能な標準フォント）
- 地図記号: SVGパスとして展開（フォント不要）

---

## 14. リアルタイム同時編集

### 14.1 CRDT 同期設計

```
ライブラリ: Yjs

共有データ構造:
  doc.getMap("objects")      → MapObject 全体
  doc.getArray("layers")     → Layer 配列
  doc.getMap("customTpls")   → カスタムテンプレート

Awareness（カーソル共有）:
  wsProvider.awareness.setLocalStateField("user", {
    id, name, color,
    cursor: { x, y },   // ワールド座標
    tool,               // 現在のツール
    drawing: boolean,   // 描画中フラグ
  });
```

### 14.2 操作フロー

```
ユーザーA が線を確定する
  → Yjs Map を更新（Y.Map.set(id, object)）
  → Yjs が差分を自動計算
  → WebSocket で他ユーザーに配信
  → 他ユーザーの Yjs が自動マージ
  → React の observe で再描画

競合: 2人が同じオブジェクトを同時に更新
  → CRDT が Last-Write-Wins で自動解決
  → データ消失なし
```

### 14.3 永続化

```
y-leveldb: サーバー側でYjsドキュメントをLevelDBに保存
フォールバック: 一定周期でPostgreSQLにスナップショットを書き込む

起動フロー:
  1. ブラウザがWebSocketに接続
  2. サーバーが保存済みYjsドキュメントを送信
  3. ブラウザがy-indexeddbにもキャッシュ（オフライン対応）
```

### 14.4 カーソル表示

他ユーザーのカーソルはSVGのワールド座標内に配置し、ビュートランスフォームに追従させる。名前バッジとカーソル矢印を描画する。ユーザーごとに固有の色を割り当てる。

---

## 15. インフラ・デプロイ構成

### 15.1 本番環境構成

```
[ユーザーブラウザ]
      ↓ HTTPS
[Cloudflare CDN] ← 静的アセット配信 / DDoS対策
      ↓
  ┌───────────────────────────────┐
  │  [Vercel]                     │
  │  React SPA（フロントエンド）   │
  └───────────────────────────────┘
      ↓ WebSocket / REST API
  ┌───────────────────────────────┐
  │  [Fly.io]  東京リージョン(nrt) │
  │  ├── APIサーバー (Hono)       │
  │  └── y-websocket サーバー     │
  └───────────────────────────────┘
      ↓
  ┌────────────┐  ┌──────────────────┐  ┌────────────────┐
  │ Supabase   │  │ Cloudflare R2    │  │ Upstash Redis  │
  │ PostgreSQL │  │ ファイルストレージ│  │ セッション     │
  │ Auth       │  │ .fmap/.svg/PNG   │  │ キャッシュ     │
  └────────────┘  └──────────────────┘  └────────────────┘
```

### 15.2 費用試算（月額・個人開発初期）

| サービス | 費用 | 備考 |
|----------|------|------|
| Vercel | 無料 | Hobbyプラン |
| Fly.io | $0〜$10 | 256MB RAM, 自動停止 |
| Supabase | 無料 | 無料枠500MB DB |
| Cloudflare R2 | 無料〜 | 10GB無料、転送費0 |
| Upstash Redis | 無料 | 10,000req/day無料 |
| **合計** | **$0〜$10/月** | |

### 15.3 CI/CD

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]

jobs:
  deploy-api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
  # フロントエンド: Vercelが push を自動検知してデプロイ
```

### 15.4 fly.toml

```toml
app = "fantasy-map-api"
primary_region = "nrt"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 3000
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1

[[vm]]
  memory = "512mb"
  cpus = 1
```

---

## 16. フロントエンドUI設計

### 16.1 レイアウト

```
┌─────────────────────────────────────────────────────────┐
│ TopBar（ツール切替・スナップ設定・Undo/Redo・エクスポート）│ 44px
├──────────────┬──────────────────────────────┬───────────┤
│              │                              │           │
│ カタログ     │   SVGキャンバス             │ レイヤー  │
│ パネル       │   （メイン描画エリア）       │ パネル    │
│ 214px       │                              │ 200px     │
│              │                              │           │
│              ├──────────────────────────────┤           │
│              │ スケールバー・コンパス       │           │
│              │ ヒントテキスト              │           │
└──────────────┴──────────────────────────────┴───────────┘
│ ステータスバー（座標・縮尺・要素数）                      │ 22px
└─────────────────────────────────────────────────────────┘
```

### 16.2 カラーパレット（UIクロム）

```
背景（上部バー）: #2c2820 （ダークブラウン）
背景（カタログ）: #f5f0e8 （紙色）
背景（キャンバス）: #f5f0e8（紙色）
強調色: #8a7050 （焦げ茶）
アクティブ色: #6a5030
テキスト（バー）: #e8dcc0, #a09070
テキスト（カタログ）: #2a1a08, #4a3a28
グリッド: rgba(100,90,70,.12) / .22
```

### 16.3 TopBar ボタン仕様

| ゾーン | 内容 |
|--------|------|
| 左端 | ロゴ・アプリ名 |
| ツール | ✏描画Q / ↖選択W / ⌫削除E |
| 描画設定 | 直線/曲線（Tab）・頂点スナップ・グリッドスナップ・角度°ドロップダウン ※描画時のみ表示 |
| 右側 | 選択削除(N)・↩↪・レイヤー・設定・出力・クリア |

### 16.4 カタログパネル仕様

- 上段: カテゴリボタン（縦スクロール、最大高さ280px）
- 下段: 選択カテゴリの要素一覧（縦スクロール、残り高さ）
- 各要素: サムネイルSVG + 名前 + 図形タイプ
- アクティブ要素: 左ボーダー強調 + 背景色変化

### 16.5 ステータスバー

```
[ツール名 · 要素名 · 直線/曲線] [N点] [スナップ状態] [選択数]
                                         (右寄せ) [X座標]m, [Y座標]m · 1:[縮尺] · [要素数]要素
```

### 16.6 モーダル設計

すべてのモーダルは共通の `Modal` コンポーネントを使用する。

- 背景: rgba(0,0,0,.42) のオーバーレイ
- 背景クリックで閉じる
- 最大高さ: 82vh（スクロール可）
- 角丸: 8px
- フォント: serif（タイトル）、sans-serif（入力）

---

## 17. 設定システム

### 17.1 設定項目

**ズームレベル別表示設定（設定モーダル）**

各レイヤーに `minS`（最小スケール）と `maxS`（最大スケール）を数値入力で設定できる。

```
vtS < minS または vtS > maxS → そのレイヤーは非表示
```

**ビューリセット**

「初期ビューに戻す」ボタンで `vt = {x:500, y:350, s:0.1}` に戻す。

### 17.2 将来の設定項目（ロードマップ）

- デフォルト地図範囲（原点・スケール）
- グリッド表示のON/OFF
- カスタム記号のSVGアップロード
- フォント選択
- 背景色・紙テクスチャ選択
- 自動保存間隔
- オフライン同期の挙動
- エクスポート解像度・余白設定

---

## 18. 公開プロダクト化の要件

### 18.1 必須要件

| カテゴリ | 要件 |
|----------|------|
| 認証 | Supabase Auth（Google/GitHub OAuth + メール） |
| データ永続化 | PostgreSQL + Yjs LevelDB + R2 |
| WebSocket | y-websocket サーバーの常時稼働 |
| HTTPS | Cloudflare / Vercel による TLS 終端 |
| ドメイン | 独自ドメイン取得（例: mapcraft.app） |
| 法的文書 | 利用規約・プライバシーポリシー |

### 18.2 セキュリティ要件

- JWTトークンによるAPI認証
- マップへのアクセス権限管理（owner/editor/viewer）
- WebSocket接続時のトークン検証
- CSRFトークン
- レートリミット（API: 100req/min/user）
- ファイルアップロードのサイズ制限・形式検証

### 18.3 スケールアップ時の追加要件

| 規模 | 追加要件 |
|------|----------|
| MAU 100〜1,000 | Fly.io を2台構成（WebSocket のスティッキーセッション） |
| MAU 1,000〜10,000 | Redis Pub/Sub で複数サーバー間のYjs同期 |
| MAU 10,000〜 | マップタイルサーバー（ラスタライズ済みタイル配信）、CDNキャッシュ戦略 |

### 18.4 機能ロードマップ

**Phase 1（MVP）**
- 基本描画・編集機能（現状実装済み）
- ユーザー認証・マップ保存
- .fmap エクスポート/インポート

**Phase 2**
- リアルタイム同時編集（Yjs WebSocket）
- バージョン管理（コミット・履歴表示）
- SVG / PNG エクスポート
- マップ公開・URL共有

**Phase 3**
- ブランチ・マージ（Git風バージョン管理）
- テンプレートパック共有マーケット
- GeoJSONエクスポート
- ズーム別タイル配信
- モバイル対応（タッチ操作）

**Phase 4**
- 3Dビュー（地形の立体表示）
- AIによる地形自動生成
- インポート（既存SVG/GeoJSONからの変換）
- チーム・ワークスペース管理

---

*本設計書はプロジェクト進行に伴い随時更新される。*
