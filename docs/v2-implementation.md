# MapCraft v2 実装書（agent用）

**版**: 1.0（2026-07-02）
**前提文書**: [v2-plan.md](./v2-plan.md)（計画書。スコープ・技術選定の理由はそちら）
**性格**: この文書は実装 agent が**質問なしで**実装を進められる詳細仕様である。仕様と実装が食い違う場合はこの文書が正。文書側を直すべき事情が見つかった場合は §0.3 の逸脱ログに従う。

---

## 0. agent 作業規約

### 0.1 進め方

1. マイルストーン M0→M10 を**この文書に書かれた順**に実施する（§6 に並行可の例外を明記）。
2. 各マイルストーンは「対象ファイル / 仕様 / DoD / 検証手順」で構成される。**DoD を全て満たし、検証手順が緑になるまで次のマイルストーンに着手しない。**
3. マイルストーン完了ごとに git コミットする（例: `M3: rendering pipeline`）。1マイルストーン内でも意味のある単位でコミットしてよい。
4. 完了報告には検証手順の実行結果（コマンド出力・確認した挙動）を添える。「動くはず」での報告は禁止。

### 0.2 共通コマンド（検証ゲート）

```powershell
# Node.js が PATH にない場合（v1 からの引き継ぎ事項）
$env:PATH = "C:\Program Files\nodejs;$env:PATH"
$pnpm = "C:\Users\<user>\AppData\Roaming\npm\pnpm.cmd"

& $pnpm check        # = type-check + vitest（全マイルストーン共通の最低ゲート）
& $pnpm dev          # web:5173 + worker:8787（手動検証用）
& $pnpm build        # 本番ビルド
& $pnpm e2e          # Playwright（M10 で整備）
```

### 0.3 逸脱ログ

仕様どおりに実装できない事情（APIの非互換・ライブラリ制約など）が出たら、勝手に別解へ進まず `docs/v2-decisions.md` に「日付 / 対象M / 問題 / 採った代替案 / 影響」を1エントリ追記し、この実装書の該当箇所も直してからコミットする。

### 0.4 コーディング規約

- TypeScript strict（`exactOptionalPropertyTypes: true` を v1 から継続）。`any` 禁止（外部境界は zod でパース）。
- 地図データの読み書きは必ず `MapDoc`（§2.3）経由。コンポーネントから直接 Y.Doc を触らない。
- ジオメトリ計算・記号定義など「描画と SVG 出力の両方が使うもの」は必ず `packages/shared` に置く。
- Pixi v8 の API は v7 と大きく異なる（§3.1）。**v1 のコードは形状・数値の参考としてのみ**使い、API 呼び出しは写さない。
- コメント・UI文言は日本語、識別子は英語。

---

## 1. リポジトリ構成（v2）

```
C:\dev\projects\Map-Creator\
├── apps/
│   ├── web/                     # React 19 + Vite + Tailwind v4
│   │   ├── src/
│   │   │   ├── app/             # ルーター・プロバイダ・エントリ
│   │   │   ├── auth/            # ログインページ・セッションフック
│   │   │   ├── dashboard/      # マップ一覧
│   │   │   ├── editor/
│   │   │   │   ├── canvas/      # PixiApp・レンダラ
│   │   │   │   ├── tools/       # select/draw/text ツール（ポインタ処理）
│   │   │   │   ├── doc/         # MapDoc（Y.Doc ラッパ）・WSプロバイダ・UndoManager
│   │   │   │   ├── ui/          # パネル群（Figma型レイアウト）
│   │   │   │   └── state/       # Zustand（uiStore / viewStore）
│   │   │   ├── export/          # PNG / SVG / .fmap
│   │   │   └── lib/             # apiクライアント等
│   │   ├── vite.config.ts       # /api を 8787 へ proxy（ws: true）
│   │   └── package.json
│   └── worker/                  # Hono + DO + D1 + R2 + 静的アセット
│       ├── src/
│       │   ├── index.ts         # Hono app・ルート合成・エクスポート
│       │   ├── auth.ts          # better-auth 設定（1ファイルに隔離）
│       │   ├── db/              # drizzle スキーマ・クエリ
│       │   ├── routes/          # maps.ts / links.ts / share.ts / thumbnails.ts
│       │   ├── rooms/MapRoom.ts # Durable Object
│       │   └── middleware/      # session / role 解決
│       ├── drizzle/             # D1 マイグレーション SQL
│       └── wrangler.jsonc
├── packages/shared/src/
│   ├── types.ts                 # §2.1
│   ├── catalog.ts               # §2.2（116要素）
│   ├── symbolPaths.ts           # 記号 SVG パス（§3.2 単一ソース）
│   ├── geometry/                # coords / snap / curve / dash / sleepers / polygon
│   ├── fmap.ts                  # .fmap zod スキーマ（§M9）
│   └── index.ts
├── docs/
│   ├── v2-plan.md / v2-implementation.md / v2-decisions.md
│   └── archive/v1/              # 旧 design.md, fantasy-map-design.md, agent-context01.md
└── package.json                 # scripts: dev / build / check / type-check / test / e2e
```

---

## 2. データモデル（全マイルストーン共通の土台）

### 2.1 型定義 — `packages/shared/src/types.ts`

v1 からの変更点: ① `geom` に `"text"` 追加 ② カタログ項目の埋め込み（`item`）を **ID参照（`itemId`）＋上書き（`styleOverride`）** に変更 ③ ラベル関連フィールド追加。

```typescript
export type Geom = "line" | "area" | "admin" | "rect" | "point" | "text";

export interface Point { x: number; y: number }   // world 座標。1 unit = 1 m。X=東, Y=南(下向き正)

export interface StyleDef {
  stroke?: string;      // CSS color
  casing?: string;      // 道路の縁取り色
  w?: number;           // 線幅 (world m)
  dash?: number[];      // [on, off] (world m)
  rail?: boolean;       // 枕木自動生成
  fill?: string;
  sw?: number;          // エリア枠線幅 (world m)
  pattern?: string;     // パターン充填ID（§3.4。植生・地形エリア用）
  sym?: string;         // symbolPaths のキー
  color?: string;       // 記号色
  size?: number;        // 記号サイズ (screen px 固定)
  z?: number;           // Zオーダー（v1と同じ体系: エリア1-5, 地形線6-14, 建物15-18, 水系19-25, 道路30-50, 鉄道51-65, 行政境界67-72, 点記号80+, テキスト90+）
}

export interface CatalogItem {
  id: string;
  name: string;         // 日本語表示名
  cat: string;          // カテゴリID（11分類）
  geom: Exclude<Geom, "text">;
  style: StyleDef;
}

export interface MapObject {
  id: string;                       // crypto.randomUUID()
  geom: Geom;
  itemId: string;                   // CatalogItem.id。geom==="text" のときは "text"（固定の擬似ID）
  pts?: Point[];                    // line / area / admin / rect（rectは対角2点）
  pt?: Point;                       // point / text のアンカー
  styleOverride?: Partial<StyleDef>; // 実効スタイル = catalog.style と shallow merge
  name?: string;                    // 付随ラベル文字列（admin は従来どおり領域名）
  showLabel?: boolean;              // 付随ラベルの表示（default false, admin は true）
  text?: string;                    // geom==="text" の本文
  fontSize?: number;                // world m（ズームに追従して拡縮）。default 100
  orientation?: "h" | "v";          // テキストの横書き/縦書き。default "h"
  mode?: "straight" | "curve";
  layerId: string;
  locked?: boolean;
  visible?: boolean;                // default true
  createdAt: number;
}

export interface Layer {
  id: string; name: string;
  visible: boolean; locked: boolean;
  minS: number; maxS: number;       // vt.s がこの範囲外なら非表示。default 0 / Infinity→格納時は 1e9
}

export interface ViewTransform { x: number; y: number; s: number }  // screen = world*s + (x,y)

export type LinkRole = "view" | "edit";
export type MapRole = "owner" | LinkRole;

export interface MapMeta {
  id: string; name: string; description?: string;
  thumbnailUrl?: string; createdAt: string; updatedAt: string;
  myRole: MapRole;
}
```

実効スタイルの解決は shared に置く:

```typescript
export function effectiveStyle(obj: MapObject, catalogById: Record<string, CatalogItem>): StyleDef;
// = { ...catalogById[obj.itemId]?.style, ...obj.styleOverride }。text は TEXT_BASE_STYLE(z:90) とマージ。
```

### 2.2 Y.Doc スキーマ（地図データの単一情報源）

```
doc.getMap("objects")   : Y.Map<Y.Map<unknown>>   // key = MapObject.id。値の Y.Map は MapObject の各フィールドを個別キーで持つ
doc.getMap("layers")    : Y.Map<Y.Map<unknown>>   // key = Layer.id。フィールド粒度は objects と同様
doc.getArray("layerOrder") : Y.Array<string>      // 描画とは無関係の「パネル表示順」。描画順は style.z
doc.getMap("meta")      : Y.Map<unknown>          // { schemaVersion: 2 }
```

粒度の規約:

- **フィールド単位 LWW**。`pts` は Point[] のプレーン配列を丸ごと置換する（頂点1個の移動でも配列置換。1ジェスチャ=1トランザクション）。
- 全ての書き込みは `doc.transact(fn, LOCAL_ORIGIN)` で行う。`LOCAL_ORIGIN` は `Symbol("local")` を `MapDoc` が保持し、`Y.UndoManager` の `trackedOrigins` に登録する（＝自分の変更だけ Undo 対象）。
- 削除は `yObjects.delete(id)`。tombstone 管理は Yjs に任せる。

デフォルトレイヤー（7つ。マップ作成時にサーバー側でシード。§M7）:

| id | name | 対応カタログ cat |
|----|------|------------------|
| terrain | 地形 | 地形 |
| water | 水系 | 水系 |
| vegetation | 植生 | 植生 |
| buildings | 建物・施設 | 建物, 施設（点）, 施設（面）, 地図記号 |
| transport | 交通 | 道路, 鉄道 |
| admin | 行政 | 行政境界, 行政区分 |
| annotation | 注記 | （text オブジェクト） |

描画時の新規オブジェクトはこの表で `layerId` を自動決定する（ユーザーはプロパティパネルで変更可）。

### 2.3 MapDoc — `apps/web/src/editor/doc/MapDoc.ts`

Y.Doc を隠蔽する唯一の窓口。

```typescript
export class MapDoc {
  readonly doc: Y.Doc;
  readonly undo: Y.UndoManager;          // scope: [objects, layers, layerOrder], trackedOrigins: [LOCAL_ORIGIN]
  getObject(id: string): MapObject | undefined;
  getAllObjects(): MapObject[];
  upsertObject(obj: MapObject): void;
  updateObject(id: string, patch: Partial<MapObject>): void;   // undefined 値のキーはフィールド削除
  deleteObjects(ids: string[]): void;
  getLayers(): Layer[];                   // layerOrder 順
  updateLayer(id: string, patch: Partial<Layer>): void;
  addLayer(name: string): Layer;  removeLayer(id: string): void;  // remove は所属オブジェクトも削除（確認UIは呼び出し側）
  moveLayer(id: string, toIndex: number): void;
  transact(fn: () => void): void;        // 複数操作を1 undo 単位に束ねる
  observeObjects(cb: (changedIds: Set<string>) => void): () => void;  // Yjs deep observer → 変更IDの集合に正規化
  observeLayers(cb: () => void): () => void;
  destroy(): void;
}
```

### 2.4 D1 スキーマ（drizzle。better-auth 管理テーブルは除く）

```sql
CREATE TABLE maps (
  id TEXT PRIMARY KEY,                       -- crypto.randomUUID()
  owner_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '新しい地図',
  description TEXT,
  thumbnail_key TEXT,                        -- R2 キー
  created_at INTEGER NOT NULL,               -- epoch ms
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_maps_owner ON maps(owner_id);

CREATE TABLE map_links (
  token TEXT PRIMARY KEY,                    -- URL-safe 32文字乱数（crypto.getRandomValues → base64url）
  map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('view','edit')),
  created_at INTEGER NOT NULL,
  revoked_at INTEGER                         -- NULL=有効
);
CREATE INDEX idx_links_map ON map_links(map_id);
```

### 2.5 HTTP API（Hono, すべて `/api` 配下）

認可の凡例: 🔑=ログイン必須, O=オーナーのみ, E=編集ロール（owner or 有効な edit リンク）, V=閲覧以上。

| メソッド/パス | 認可 | 内容 |
|---|---|---|
| `ALL /api/auth/*` | - | better-auth ハンドラ（Google OAuth・セッション） |
| `GET /api/me` | 🔑 | `{ id, name, email, image }` |
| `GET /api/maps` | 🔑 | 自分のマップ一覧（MapMeta[]） |
| `POST /api/maps` `{name?}` | 🔑 | 作成 → D1 insert → DO `seed()` 呼び出し（§M7） |
| `GET /api/maps/:id?t=token` | V | MapMeta（`myRole` 込み） |
| `PATCH /api/maps/:id` `{name?,description?}` | O | 更新 |
| `DELETE /api/maps/:id` | O | D1 delete → DO `purge()` → R2 サムネイル削除 |
| `GET /api/maps/:id/links` | O | リンク一覧（有効・失効両方） |
| `POST /api/maps/:id/links` `{role}` | O | 発行 → `{token, role}` |
| `DELETE /api/maps/:id/links/:token` | O | 失効（`revoked_at` セット。物理削除しない） |
| `GET /api/share/:token` | 🔑 | `{mapId, role, name}`。失効済みは 404 |
| `GET /api/maps/:id/ws?t=token` | V | WebSocket upgrade → MapRoom へ転送（role をヘッダで DO に伝達） |
| `POST /api/maps/:id/thumbnail` | E | body=PNG → R2 put `thumb/{mapId}.png` → D1 更新 |
| `GET /api/thumbnails/:mapId` | 🔑 | R2 から返却（Cache-Control: private, max-age=60） |

ロール解決ミドルウェア `resolveRole(mapId, user, token)`: owner_id 一致 → `owner`。`?t=` があれば map_links を引き（revoked_at IS NULL）その role。どちらも無ければ 403。エラー形式は `{ error: string }` に統一。

---

## 3. 描画・エディタの共通仕様

### 3.1 Pixi.js v8 の作法（v7 との差分。厳守）

- 初期化は `const app = new Application(); await app.init({ ... })`。`new Application(options)` に直接渡す v7 作法は不可。
- Graphics は `g.moveTo().lineTo().stroke({ width, color, alpha, cap: "round", join: "round" })` / `g.poly(flatPts).fill(color)` のビルダー式。`beginFill`/`lineStyle` は存在しない。
- SVG パス描画は `GraphicsPath`（`new GraphicsPath(dAttr)`）→ `g.path(path).fill(...)`。
- 色は `0xrrggbb` number か CSS 文字列をそのまま渡せる（v1 の `style.ts` 変換層は不要）。
- **実装前に必ず Pixi v8 の公式ドキュメントで当該 API の正確なシグネチャを確認する**（v8 系はマイナーでも変わる）。確認結果が本節と食い違えば §0.3 の逸脱ログへ。
- StrictMode 下の二重マウント対策（v1 で踏んだ罠）: `PixiCanvas` コンポーネントは init 中フラグと destroy ガードを持ち、`app.destroy(true, { children: true })` を確実に呼ぶ。

### 3.2 記号の単一ソース — `packages/shared/src/symbolPaths.ts`

全点記号（catalog の `sym` 全種 + パターン用グリフ）を **24×24 viewBox の SVG パス文字列**で定義する。

```typescript
export interface SymbolDef {
  d: string;              // path data（viewBox 0 0 24 24、単一パス。fill-rule evenodd 前提）
  strokeOnly?: boolean;   // true なら fill せず stroke（線画記号: 温泉の湯気など）
}
export const SYMBOL_PATHS: Record<string, SymbolDef>;
```

- Pixi レンダラは `GraphicsPath(d)` で、SVG ライターは `<path d>` で**同じ定義**を使う。これで Pixi と SVG 出力の記号が原理的に一致する。
- 形状は v1 の `drawSymbol.ts`（425行）の描画ロジックを読み、等価な 24×24 パスに変換して定義し直す。国土地理院の記号形状に忠実であること（v1 で簡略化しすぎたものは GSI の記号一覧を参照して修正してよい。修正したら v2-decisions.md に列挙）。
- 対象キー一覧は catalog の `sym` 値全種（42種 = 施設(点)23＋地図記号16＋水系3）＋パターングリフ 8種（§3.4）。

### 3.3 レンダラアーキテクチャ（v1 の全再描画からの脱却）

```
PixiApp
├── worldRoot: Container            // vt を position/scale に反映
│   ├── objectLayer: Container      // sortableChildren=true, zIndex = style.z
│   │   └── Map<objectId, Container>   // オブジェクトごとに1 Container（Graphics + ラベルText）
│   └── previewLayer: Container     // 描画中プレビュー
├── gridLayer: Container            // screen 空間。ビュー変更ごとに再描画
└── overlayLayer: Container         // screen 空間。選択枠・頂点ハンドル・リモートカーソル
```

- **差分再描画**: `MapDoc.observeObjects` の changedIds のみ、該当 Container を破棄→再構築する。全再描画 API は作らない。
- **ビュー変更時**（pan/zoom）: worldRoot の transform 更新＋①グリッド再描画 ②点記号・テキストハンドルのスクリーン固定要素のスケール補正（§3.5）③カリング（各オブジェクトの world bbox をキャッシュし、ビューポート外は `visible=false`）④レイヤー minS/maxS 判定。
- **道路**: 1オブジェクト内で casing → 本線の2パス。cap/join は `"round"`（交差部のアーティファクト緩和。オブジェクト間のグローバル2パス化は将来課題として v2-decisions.md に記録済みとする）。
- **鉄道枕木**: `sleepers(pts, spacing, len)`（shared/geometry）が返す線分列を stroke。spacing = `w*3`、len = `w*2`（world）。
- **破線**: Pixi v8 に破線 stroke は無い。shared の `dashSegments(pts: Point[], dash: [number, number]): Point[][]` で線分列に分解して描く（SVG ライターは native の `stroke-dasharray` を使う）。
- **線幅クランプ**: 描画幅 = `max(style.w, 0.75 / vt.s)`（ズームアウトしても 0.75px 未満にならない）。
- **曲線**: `mode==="curve"` は `catmullRom(pts, 16, closed)`（v1 の `coords.ts` から移植）で密化してから描画。ヒットテストも密化後の点列を使う。

### 3.4 パターン充填（地図らしさ）

対象: `style.pattern` を持つエリア。catalog では 植生10種のうち forest/bamboo/orchard/rice/farmland/grassland と、地形の wetland/sand に設定する（計8種）。

- `PatternRegistry`: パターンID → `RenderTexture`（48×48px。SYMBOL_PATHS のパターングリフを中央に1つ、記号色で描画）を lazy 生成しキャッシュ。
- エリアの fill の上に `TilingSprite`（パターンテクスチャ）を重ね、ポリゴン Graphics を `mask` にする。
- タイルは**スクリーン固定**（実地図の紙面固定パターンに準拠）: ビュー変更時に `tileScale = 1 / vt.s` を再設定。
- SVG ライターでは `<defs><pattern>` で同グリフを参照（§M9）。

### 3.5 スクリーン固定要素

- **点記号**: world 座標に置くが見た目サイズは `style.size` px 固定。ビュー変更時に該当 Container の `scale = size / 24 / vt.s` を一括更新（対象は point オブジェクトのみなので軽い）。
- **テキスト**は world 固定（`fontSize` m がズームに追従）。ラベルには白縁取り（Pixi: `stroke: { color: 0xffffff, width: fontSize*0.15 }` 相当の TextStyle、SVG: `paint-order: stroke`）。
- **選択枠・頂点ハンドル・リモートカーソル**: overlayLayer（screen 空間）に描画し、毎フレームではなくビュー変更・選択変更・awareness 変更時に再計算。ハンドルは 8px 四方。

### 3.6 ビューポート・座標系

- `viewStore`（Zustand）: `{ vt: ViewTransform }`、actions `zoomAt(factor, cx, cy)` / `pan(dx, dy)` / `fitBounds(bbox)` / `reset()`。
- ホイール: `factor = 1.0015 ** (-e.deltaY)`、`s` は `[0.005, 50]` にクランプ。カーソル位置不動でズーム。
- パン: Space 押下中ドラッグ or 中ボタンドラッグ or `pan` ツール。
- 座標変換・グリッド間隔・縮尺表記は v1 の `coords.ts` を `packages/shared/src/geometry/` へそのまま移植（`screenToWorld` / `worldToScreen` / `gridInterval`(70px基準NICE間隔) / `snapToGrid` / `snapAngle` / `scaleToRatio` / `catmullRom` / `maybeSmooth` / `closestOnSegment` / `pointInPolygon` / `distance`）。追加: `polygonCentroid(pts)` / `bbox(pts)` / `dashSegments` / `sleepers`。

### 3.7 スナップ（v1 仕様を踏襲）

半径 **14 screen px 固定**（`14 / vt.s` を world 換算）。優先順位: ①頂点（既存オブジェクトの頂点、次いで線分上最近点） ②グリッド（`gridInterval(vt.s)`） ③角度（直前頂点から `angleDeg`=45° 刻み。Shift 押下中のみ有効でもよい→**常時 config 依存**とし、uiStore の `snapConfig { vertex, grid, angle, angleDeg }` で個別 ON/OFF）。スナップ確定点は overlayLayer にインジケータ（頂点=赤丸、グリッド=十字、角度=補助線）を表示。

### 3.8 ヒットテスト — `editor/tools/hitTest.ts`

`hitTest(world: Point, vt, objects, layers): MapObject | null`。可視（オブジェクト visible・レイヤー visible・minS/maxS 内）かつ非ロックのオブジェクトを **z 降順**に走査し最初のヒットを返す。許容誤差 `tol = 6 / vt.s`。

| geom | 判定 |
|---|---|
| line | 密化後点列の各線分との距離 ≤ tol + w/2 |
| area / admin | `pointInPolygon`（密化後）or 枠線から tol 以内 |
| rect | 対角2点の bbox 内 or 枠線から tol 以内 |
| point | アンカーとの距離 ≤ `(size/2 + 4) / vt.s` |
| text | 計測済みテキスト bbox（world）内 |

矩形選択 `hitTestRect(rect, ...): MapObject[]` は bbox 交差で判定（ロック中・非表示は除外）。

### 3.9 UI レイアウト（Figma型・ライトテーマ）

```
┌────────────────────────────────────────────────────────┐
│ TopBar: ロゴ / マップ名(クリックで改名) / 接続状態 /      │
│         プレゼンスアバター列 / 共有ボタン / エクスポート ▾ │
├──┬──────────────────────────────────┬──────────────────┤
│Tool│                                  │ PropertiesPanel  │
│Bar │          PixiCanvas              │ （選択時のみ内容） │
│    │                                  ├──────────────────┤
│Cata│                                  │ LayerPanel        │
│log/│                                  │                  │
│Layer                                  │                  │
├──┴──────────────────────────────────┴──────────────────┤
│ StatusBar: カーソル座標(m) / 縮尺(1:n) / スナップ状態      │
└────────────────────────────────────────────────────────┘
```

- **ToolBar**（左端・幅48px・アイコン縦並び）: 選択(V) / ペン=描画(P) / テキスト(T) / パン(H)。描画ツール選択中は左に CatalogPanel（11カテゴリのアコーディオン＋検索フィルタ）を表示。
- **PropertiesPanel**（右・幅280px）: §M5。
- テーマ: ライト固定。UI クロームはニュートラルグレー（Tailwind zinc 系）、キャンバス背景 `#f7f5f0`（紙色）。
- キーボードショートカット一覧（`editor/ui/shortcuts.ts` に一元定義し、ヘルプモーダル `?` で表示）:
  `V/P/T/H` ツール、`Space` 一時パン、`Tab` 直線/曲線切替（描画中）、`Enter`/ダブルクリック 確定、`Esc` キャンセル/選択解除、`Del` 削除、`Ctrl+Z` / `Ctrl+Shift+Z` Undo/Redo、`Ctrl+C/X/V` コピー/カット/ペースト、`Ctrl+D` 複製、矢印 ナッジ（グリッド1間隔、Shift で×10）、`Ctrl+0` 全体表示、`Ctrl+=`/`Ctrl+-` ズーム。

### 3.10 uiStore（Zustand。UI 状態のみ）

```typescript
{
  tool: "select" | "draw" | "text" | "pan";
  activeItemId: string | null;            // draw ツールのカタログ選択
  selectedIds: string[];                  // ローカル選択（awareness にも送出）
  editingVertex: { objectId: string; index: number } | null;
  drawing: { pts: Point[]; mode: "straight" | "curve" } | null;
  snapConfig: { vertex: boolean; grid: boolean; angle: boolean; angleDeg: number };
  cursorWorld: Point | null;
  panels: { catalog: boolean };
}
```

---

## 4. リアルタイム同期の仕様（M7 で実装。設計は全 M の前提）

### 4.1 方針

- クライアントは常にローカル Y.Doc で動く（M3〜M6 の時点では WS 未接続のまま完結）。M7 で `MapProvider` を差し込むと同期が始まる。**M3〜M6 のコードは WS の存在を知らない**こと。
- サーバー（MapRoom DO）は **Y.Doc をインスタンス化しない**。update バイナリの merge/diff のみで応答する（`Y.mergeUpdates` / `Y.encodeStateVectorFromUpdate` / `Y.diffUpdate`）。これにより hibernation と両立する。

### 4.2 WS メッセージ（バイナリ。y-protocols 準拠）

`lib0/encoding` で `[messageType: varUint, payload]`。

| type | 名称 | 内容 |
|---|---|---|
| 0 | sync | y-protocols/sync の step1(state vector) / step2(diff update) / update |
| 1 | awareness | y-protocols/awareness のエンコード済み update |

接続時ハンドシェイク: サーバーは accept 直後に「サーバー側 merged update から作った SyncStep1」を送信。クライアントも SyncStep1 を送信。以降は相互に step2/update を交換（y-protocols の標準フロー）。view ロールのソケットから届いた sync-update は**破棄**し、`{type:"error", code:"readonly"}` の JSON テキストフレームを返す（awareness は view でも許可＝カーソルは見せ合う）。

### 4.3 MapRoom DO（`apps/worker/src/rooms/MapRoom.ts`）

- `idFromName(mapId)` で 1マップ=1DO。
- WebSocket は **hibernation API**（`this.ctx.acceptWebSocket(ws, [role])` / `webSocketMessage` / `webSocketClose`）。role は `serializeAttachment` に保存。
- DO 内 SQLite: `CREATE TABLE IF NOT EXISTS updates (id INTEGER PRIMARY KEY AUTOINCREMENT, data BLOB NOT NULL)`。
- sync-update 受信: ① `updates` に INSERT ② 送信元以外の全ソケットへブロードキャスト ③ 行数 > 200 なら `Y.mergeUpdates(全行)` で1行に圧縮（トランザクション内で DELETE→INSERT）。
- RPC メソッド（Worker から stub 経由で呼ぶ）:
  - `seed(initialUpdate: Uint8Array)`: 空のときだけ初期 update を格納（マップ作成時。Worker 側で一時 Y.Doc を組み立て default layers + meta を入れ `Y.encodeStateAsUpdate`）。
  - `purge()`: 全行削除＋全ソケット close（マップ削除時）。

### 4.4 クライアント `MapProvider`（`editor/doc/provider.ts`）

- `new WebSocket(wss://…/api/maps/:id/ws?t=token)`。y-protocols の sync/awareness 処理を実装（`y-websocket` の Provider は使わず薄く自前実装。依存: `yjs`, `y-protocols`, `lib0`）。
- 再接続: 指数バックオフ 1s→2s→…→最大 30s。切断中もローカル編集は継続（Y.Doc に溜まり、再接続時の step1/2 で自動送達）。
- 接続状態 `"connecting" | "connected" | "offline"` を TopBar に表示。
- awareness state: `{ user: { id, name, color }, cursor: Point | null, selection: string[] }`。color は userId のハッシュから HSL で決定（彩度70%・明度45%固定、色相のみ分散）。

---

## 5. 環境変数・シークレット

```bash
# apps/worker/.dev.vars（ローカル。gitignore）
BETTER_AUTH_SECRET=<openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:8787
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
E2E_TEST_MODE=1            # ローカル/E2E のみ。本番には絶対に設定しない（§M10）

# 本番: wrangler secret put BETTER_AUTH_SECRET / GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
# BETTER_AUTH_URL は wrangler.jsonc の vars に本番URLを記載
```

フロントに環境変数は不要（API は同一オリジン相対パス）。Vite dev では `/api` を `http://localhost:8787` へ proxy（`ws: true` 必須）。

---

## 6. マイルストーン詳細

依存グラフ: `M0 → M1 → M3 → M4 → M5 → M7 → M8 → M10`、`M0 → M2 → M7`、`M4 → M6`、`M5 → M9`。
worktree 並行可: （M1‖M2）（M5‖M6）（M9のSVGライターは M1 完了後いつでも）。

### M0 — 基盤再編

**目的**: 旧コードを退避し、v2 のワークスペース・ビルド・検証ゲートが空実装で通る状態を作る。
**依存**: なし。

**対象**: リポジトリルート全体、`apps/web`、`apps/worker`、`packages/shared`、`docs/`。

**仕様**:

1. 旧 docs を `git mv` で `docs/archive/v1/` へ（`design.md` / `fantasy-map-design.md` / `agent-context01.md`）。`docs/v2-decisions.md` を空テンプレで作成。
2. 旧コード削除: `apps/api`・`apps/web`・`packages/shared` を `git rm -r`（M1/M3 の移植は git 履歴 `git show HEAD~n:path` で参照する。削除コミットのハッシュを v2-decisions.md に記録しておく）。
3. 新ワークスペースを §1 の構成でスキャフォールド:
   - ルート `package.json` scripts: `dev`（web と worker を並行起動）/ `build`（shared→web→worker の順）/ `type-check` / `test`（vitest）/ `check`（type-check + test）/ `e2e`。
   - `tsconfig.base.json`: strict / `exactOptionalPropertyTypes` / `verbatimModuleSyntax`。v1 のものを流用してよい。
   - `packages/shared`: ビルドステップなし（`"main": "./src/index.ts"`、v1 と同方式）。
   - `apps/web`: Vite + React 19 + `@tailwindcss/vite`（Tailwind v4）。`vite.config.ts` に `/api` proxy（target 8787, `ws: true`）。
   - `apps/worker`: Hono。`wrangler.jsonc`:
     ```jsonc
     {
       "name": "mapcraft",
       "main": "src/index.ts",
       "compatibility_date": "2026-06-01",   // 作業日時点の最新に更新すること
       "compatibility_flags": ["nodejs_compat"],
       "assets": { "directory": "../web/dist", "binding": "ASSETS",
                   "not_found_handling": "single-page-application",
                   "run_worker_first": ["/api/*"] },
       "durable_objects": { "bindings": [{ "name": "MAP_ROOM", "class_name": "MapRoom" }] },
       "migrations": [{ "tag": "v1", "new_sqlite_classes": ["MapRoom"] }],
       "d1_databases": [{ "binding": "DB", "database_name": "mapcraft", "database_id": "<wrangler d1 create mapcraft で取得>",
                          "migrations_dir": "drizzle" }],   // drizzle-kit の出力先と d1 migrations apply の参照先を一致させる
       "r2_buckets": [{ "binding": "THUMBS", "bucket_name": "mapcraft-thumbnails" }],
       "observability": { "enabled": true }
     }
     ```
     `MapRoom` はこの時点では空クラス（`DurableObject` 継承・fetch で 501）でよい。
   - drizzle-kit セットアップ: `apps/worker/drizzle/` にマイグレーション出力、scripts `db:generate` / `db:migrate:local`（`wrangler d1 migrations apply mapcraft --local`）/ `db:migrate:remote`。
   - `wrangler d1 create mapcraft`・`wrangler r2 bucket create mapcraft-thumbnails` を実行し ID を wrangler.jsonc に反映（要ユーザー承認の可能性あり。実行できない場合はプレースホルダのまま v2-decisions.md に明記して先へ進む — ローカル開発は `--local` で ID 不要）。
4. Vitest は `packages/shared` と `apps/web` を対象にルートから一括実行できる構成（workspace 機能）。ダミーテスト1件を置く。
5. `.dev.vars.example` / `.env` 類の整理: 旧 `apps/web/.env.local`・`apps/api/.dev.vars` は**削除しない**（M10 の Supabase 廃止まで温存。ただし新コードからは参照しない）。

**DoD**:
- [ ] `pnpm install` / `pnpm check` / `pnpm build` が成功
- [ ] `pnpm dev` で web(5173) に React 雛形、worker(8787) の `/api/health` が `{ok:true}` を返す
- [ ] `pnpm db:migrate:local` が空マイグレーションで成功
- [ ] 旧 docs が archive/v1 に移動済み、旧コードが削除済み

**検証手順**: 上記コマンドを順に実行し出力を記録。`curl http://localhost:8787/api/health` と 5173 proxy 経由 `curl http://localhost:5173/api/health` の両方を確認。

---

### M1 — shared パッケージ（型・カタログ・記号・ジオメトリ）

**目的**: 全レイヤーが依存する共有基盤を確定させる。**このマイルストーン完了後、§2.1 の型と catalog の ID 体系は原則凍結**（変更には v2-decisions.md 必須）。
**依存**: M0。M2 と並行可。

**対象**: `packages/shared/src/types.ts` / `catalog.ts` / `symbolPaths.ts` / `geometry/*` / `fmap.ts` / `index.ts`、各ユニットテスト。

**仕様**:

1. `types.ts`: §2.1 を実装。`effectiveStyle()` と `defaultLayerFor(catalogItem): string`（§2.2 の対応表）も実装。
2. `catalog.ts`: v1 の 116 要素を **ID・名前・スタイル値を変えずに**移植（`git show` で参照）。変更点のみ: ①パターン充填対象 8 種（forest / bamboo / orchard / rice / farmland / grassland / wetland / sand）に `pattern` キーを追加（値は記号グリフID。例 `pattern: "pat-forest"`）②型を v2 CatalogItem に適合。エクスポートは `CATALOG` / `CATALOG_BY_ID` / `CATEGORIES` / `getCatalogByCategory` を維持。
3. `symbolPaths.ts`: §3.2。catalog の `sym` 全種（42種）＋パターングリフ 8種。v1 `drawSymbol.ts` を読み解いて 24×24 パスに変換。目視確認用に Vite の開発専用ページ `apps/web/src/dev/SymbolGallery.tsx`（ルート `/dev/symbols`、`import.meta.env.DEV` のみ）で全記号を SVG 表示する。
4. `geometry/`: v1 `coords.ts` の全関数を移植（§3.6 の一覧）＋新規 `polygonCentroid` / `bbox` / `dashSegments` / `sleepers` / `hitSegmentDistance`。全て純関数・Pixi 非依存。
5. `fmap.ts`: zod で .fmap v2 スキーマ（§M9 の形式）を定義。`parseFmap(json: unknown): FmapFile`（throw する）と `serializeFmap(...)`。
6. ユニットテスト（vitest）:
   - 座標変換の往復（`screenToWorld∘worldToScreen = id`）
   - `gridInterval` の境界値、`snapToGrid` / `snapAngle` の代表値
   - `catmullRom` 開/閉の端点保存（開: 両端点一致、閉: 始点で閉じる）
   - `dashSegments`（合計長の保存、[on,off] 比率）と `sleepers`（本数 = floor(長さ/spacing)±1、法線方向であること）
   - `pointInPolygon` / `polygonCentroid` / `bbox` の代表形状
   - catalog: 件数=116、ID 重複なし、全 `sym` が SYMBOL_PATHS に存在、全 cat が §2.2 対応表に載っている
   - fmap: 正常系 roundtrip、壊れた JSON の reject

**DoD**:
- [ ] `pnpm check` 緑（テスト 30 ケース以上）
- [ ] `/dev/symbols` で 50 記号（42＋パターングリフ8）が表示され、崩れがない（目視。スクリーンショットを報告に添付）

**検証手順**: `pnpm check` 出力、`/dev/symbols` のスクリーンショット。

---

### M2 — 認証＋メタデータ（better-auth / D1 / ダッシュボード）

**目的**: Google ログイン→マップ一覧→作成/改名/削除の一連が動く。
**依存**: M0。M1 と並行可（shared の MapMeta 型のみ使用）。

**対象**: `apps/worker/src/auth.ts` / `db/schema.ts` / `db/queries.ts` / `routes/maps.ts` / `middleware/session.ts` / `index.ts`、`apps/web/src/auth/*` / `dashboard/*` / `app/router.tsx` / `lib/api.ts`。

**仕様**:

1. **better-auth**（`auth.ts` に完全隔離）: drizzle adapter (D1) + Google social provider。`GET/POST /api/auth/*` にマウント。セッションは Cookie（`sameSite: "lax"`, `secure`（本番）, httpOnly）。better-auth のスキーマ生成 CLI で user/session/account/verification テーブルの migration を生成。
   - **フォールバック**: better-auth が Workers + D1 で安定動作しない場合は、`arctic`（Google OAuth）＋自前 session テーブル（token cookie, 30日, sliding）に差し替える。この場合も `auth.ts` のエクスポート（`getSession(c): Promise<User | null>` / `authHandler`）は同一に保ち、逸脱ログに記録。
2. **E2E テストモード**: env `E2E_TEST_MODE` が truthy のとき、リクエストヘッダ `x-e2e-user: <email>` を「そのメールのユーザーとしてログイン済み」と扱う（ユーザーが無ければ user テーブルへ upsert）。`session.ts` 内で分岐し、**本番 vars に E2E_TEST_MODE を置かないことを M10 チェックリストに含める**。
3. **middleware/session.ts**: `requireUser`（401）と `resolveRole`（§2.5。この時点では owner 判定のみ実装、link は M8 で拡張）。
4. **routes/maps.ts**: §2.5 の `GET/POST /api/maps`, `GET/PATCH/DELETE /api/maps/:id`。zod でボディ検証。DELETE の DO purge / R2 削除は M7/M9 で追記するまで TODO コメント不可 → `// M7で purge を追加` ではなく、`purge` 呼び出しを行う空実装 RPC を M0 の MapRoom スタブに用意して呼んでおく。
5. **web**: ルーター（react-router）: `/login` / `/dashboard` / `/edit/:mapId`（M3 でキャンバス、今はプレースホルダ）/ `/s/:token`（M8）。未ログインで保護ルートへ来たら `/login` へ。
   - LoginPage: 「Googleでログイン」ボタン → better-auth の signIn.social。
   - Dashboard: カード型グリッド（サムネイル・名前・更新日時）。新規作成ボタン（作成後 `/edit/:id` へ遷移）、カードメニューで改名（インライン）・削除（confirm ダイアログ）。空状態の案内文。
   - `lib/api.ts`: fetch ラッパ（`credentials: "include"` 不要＝同一オリジン、エラー時 `{error}` を throw、zod で応答パース）。

**DoD**:
- [ ] Google ログイン→ダッシュボード→作成→改名→削除が実際に動く（手動確認）
- [ ] 未ログインで `/api/maps` → 401、他人のマップ `GET /api/maps/:id` → 403（curl で確認）
- [ ] `x-e2e-user` ヘッダでのテストログインがローカルで機能
- [ ] `pnpm check` 緑

**検証手順**: `pnpm dev` でブラウザ実操作（ユーザーの Google アカウント使用。OAuth 設定は計画書 §9 のユーザータスク完了が前提）。curl で 401/403 を確認し出力を記録。

---

### M3 — 描画基盤（Pixi v8 レンダラパイプライン）

**目的**: ローカル Y.Doc に入っているオブジェクトが §3 の仕様どおり描画され、ビュー操作が 60fps で動く。
**依存**: M1。

**対象**: `editor/canvas/PixiApp.ts` / `canvas/renderObject.ts` / `canvas/renderers/{line,area,rect,symbol,text}.ts` / `canvas/PatternRegistry.ts` / `canvas/grid.ts` / `canvas/overlay.ts`、`editor/doc/MapDoc.ts`、`editor/state/{uiStore,viewStore}.ts`、`editor/ui/{EditorLayout,TopBar,StatusBar,ToolBar}.tsx`、`app/EditorPage.tsx`。

**仕様**:

1. `MapDoc`（§2.3）を実装。EditorPage は mapId ごとに `MapDoc` を生成（この時点では空 doc + `seedLocalDefaults()` でデフォルトレイヤー投入。M7 で Provider に置換される想定のインターフェースにしておく）。
2. `PixiApp`: §3.3 の Container 構成。`init(canvas, mapDoc, stores)` / `destroy()`。React 側は `PixiCanvas` コンポーネント（StrictMode 二重マウントガード必須。§3.1）。
3. レンダラ: geom 別に §3.3〜§3.5 を実装。`renderObject(obj, catalog): Container` は純粋に「1オブジェクト→Container」の変換。差分再描画は changedIds のみ。admin は fill+枠線+中央ラベル（name）。
4. パターン充填（§3.4）、グリッド（§3.6、メジャー/マイナー2階調）、線幅クランプ、カリング、レイヤー minS/maxS を実装。
5. UI シェル: §3.9 のレイアウト枠（ToolBar はツール切替のみ動作、CatalogPanel は M4、PropertiesPanel は M5 でプレースホルダ）。StatusBar に座標・縮尺（`scaleToRatio`）。ビュー操作（ホイールズーム・Space/中ボタンパン・`Ctrl+0` fitBounds）。
6. 開発用シード: `/edit/:id?seed=demo` のとき代表オブジェクト（全 geom・道路・鉄道・パターンエリア・記号 20 個程度）を投入する dev 専用関数。手動検証と M10 性能試験の土台。

**DoD**:
- [ ] `?seed=demo` で全 geom が §3 の見た目（casing、枕木、破線、パターン、スクリーン固定記号）で表示される
- [ ] ズーム全域（s=0.005〜50）でクラッシュ・描画崩れなし。ズームアウトで線が消えない（クランプ）
- [ ] レイヤー minS/maxS・visible の切替が反映される（コンソールから MapDoc 操作で確認）
- [ ] オブジェクト1件変更で他オブジェクトの Container が再構築されない（devtools でログ確認できる形に）
- [ ] `pnpm check` 緑

**検証手順**: `pnpm dev` → `/edit/xxx?seed=demo` のスクリーンショット（通常・ズームイン・ズームアウトの3枚）。差分再描画のログ出力を記録。

---

### M4 — 描画ツール

**目的**: v1 同等の「描く」体験（＋スナップ・曲線）を新パイプライン上で実現。
**依存**: M3。

**対象**: `editor/tools/{ToolManager,drawTool,panTool}.ts` / `tools/snap.ts` / `canvas/preview.ts`、`editor/ui/CatalogPanel.tsx`、uiStore 拡張。

**仕様**:

1. `ToolManager`: pointerdown/move/up/キーを現在ツールへディスパッチ。Space 一時パンはツール横断で処理。
2. CatalogPanel: 11 カテゴリのアコーディオン＋テキスト検索。項目クリックで `tool="draw"` + `activeItemId` 設定。項目には記号/線種のミニプレビュー（SYMBOL_PATHS / スタイル色から生成）。
3. drawTool の挙動（geom 別）:
   - **line / area / admin**: クリックで頂点追加。previewLayer に確定分＋カーソルまでのラバーバンド（curve モードは `maybeSmooth` 済みで表示）。`Tab` で straight/curve 切替（描画中も可）。`Enter` or ダブルクリックで確定（line は 2 点以上、area/admin は 3 点以上。未満なら無視）。`Esc` で破棄。`Backspace` で直前頂点を取り消し。
   - **rect**: pointerdown→drag→up の対角指定。Shift で正方形。
   - **point**: クリック即確定（連続配置モード: 確定後もツール継続）。
   - 確定時: `MapObject` を組み立て（`layerId = defaultLayerFor(item)`、`createdAt = Date.now()`、admin は `name: "新しい領域"`・`showLabel: true`）、`mapDoc.upsertObject`。確定後も同じカタログ項目で連続描画できる。
   - 対象レイヤーがロック中なら描画確定を拒否しステータスバーに理由を表示。
4. スナップ（§3.7）: drawTool のカーソル解決に適用。スナップインジケータを overlay に表示。uiStore.snapConfig の切替 UI は StatusBar 右端のトグル3つ。
5. Undo/Redo: `Ctrl+Z` / `Ctrl+Shift+Z` → `mapDoc.undo.undo()/redo()`。描画1確定=1 undo 単位になっていること（transact 境界の確認）。

**DoD**:
- [ ] 全 geom を実際に描ける。曲線・スナップ3種・Tab 切替・Esc/Backspace が仕様どおり
- [ ] Undo/Redo が描画単位で効く
- [ ] `pnpm check` 緑（snap.ts の解決ロジックはユニットテスト追加: 頂点>グリッド>角度の優先順位）

**検証手順**: 手動で「道路網＋川＋森＋駅記号」の小地図を1枚描き、スクリーンショットを報告へ。Undo 連打→Redo 連打で復元されることを確認。

---

### M5 — 選択・編集ツール（v1 からの最重要改善）

**目的**: 描いたものを後から自由に編集できる。
**依存**: M4。M6 と並行可。

**対象**: `editor/tools/{selectTool,vertexEdit,clipboard}.ts` / `tools/hitTest.ts`、`canvas/overlay.ts` 拡張、`editor/ui/PropertiesPanel.tsx` / `ui/LayerPanel.tsx`。

**仕様**:

1. **hitTest**: §3.8。ユニットテスト（geom 別代表ケース、z 優先、tol 境界）。
2. **selectTool**:
   - クリック=単一選択（z 最上位）。`Shift+クリック`=トグル追加。空クリック=解除。
   - 空地からのドラッグ=ラバーバンド矩形選択（bbox 交差）。
   - 選択オブジェクト上からのドラッグ=**移動**。複数選択も一括移動。移動中は基準頂点（掴んだ点に最も近い頂点）にスナップ適用。`Esc` で移動キャンセル（元位置へ）。1ドラッグ=1 undo 単位。
   - 矢印キー=ナッジ（`gridInterval(vt.s)` 1つ分、Shift ×10）。
   - `Del`=選択削除。ロック中オブジェクトは選択不可（hitTest で除外）。
   - 選択表示: overlay に bbox 枠（複数時は結合 bbox＋個別薄枠）。
3. **頂点編集**（単一の line/area/admin/rect 選択時に自動で有効）:
   - 各頂点に 8px ハンドル。ドラッグで移動（スナップ適用。ただし自オブジェクトの頂点は除外）。
   - `Alt+クリック`（線分上）=その位置に頂点挿入。
   - ハンドルクリックで頂点選択→`Del`=頂点削除（下限ガード: line≥2 / area・admin≥3。rect は頂点削除不可、対角ドラッグでリサイズ）。
   - curve モードのオブジェクトはハンドル=制御点（元 pts）、表示は密化後。
4. **clipboard**: モジュール内変数（`MapObject[]` の deep copy）。`Ctrl+C/X/V`、`Ctrl+D`。ペースト位置は元座標＋`gridInterval` 1つ分オフセット、新 UUID 採番。マップを跨ぐペーストは対象外（v2.0）。
5. **PropertiesPanel**（右 280px。選択内容で切替）:
   - 単一選択: カタログ項目名＋**同 geom の別項目への変更**ドロップダウン（itemId 差し替え）、styleOverride 編集（stroke/fill/color のカラーピッカー、w/sw/size の数値、dash on/off）、「スタイルをリセット」（styleOverride 削除）、mode 切替、layerId ドロップダウン、name + showLabel、locked/visible、削除ボタン。text オブジェクトは text/fontSize/orientation（M6）。
   - 複数選択: 件数表示＋共通操作のみ（layerId 一括変更・削除・visible/locked 一括）。
   - 変更は即時 `updateObject`（数値・色は 300ms デバウンスで 1 undo 単位に）。
6. **LayerPanel**: 一覧（layerOrder 順・ドラッグで並べ替え）、visible/locked トグル、名前ダブルクリックで改名、追加・削除（削除は所属オブジェクト数を出して confirm）、minS/maxS 編集（「1:5万〜1:1千」のような縮尺表記のセレクト。内部は s 値）。

**DoD**:
- [ ] 選択・移動・矩形選択・頂点移動/挿入/削除・コピペ・複製・ナッジが仕様どおり（各操作 1 undo 単位）
- [ ] プロパティパネルからの種別変更・スタイル上書き・レイヤー移動が即時反映
- [ ] ロック（オブジェクト/レイヤー）で編集がブロックされる
- [ ] hitTest ユニットテスト緑、`pnpm check` 緑

**検証手順**: M4 で描いた地図に対し「道路を国道→高速に変更→頂点を2つ挿入して曲げる→川をコピーして支流を作る→森を移動」の一連を実施し、各段階のスクリーンショットと Undo での完全巻き戻しを確認。

---

### M6 — テキスト注記

**目的**: 自由配置テキストと付随ラベルで「地図として完成」させられる。
**依存**: M4。M5 と並行可（PropertiesPanel のテキスト欄だけ M5 とすり合わせ）。

**対象**: `editor/tools/textTool.ts`、`canvas/renderers/text.ts`、PropertiesPanel のテキスト項目、shared の TEXT_BASE_STYLE。

**仕様**:

1. **自由配置テキスト**（`geom:"text"`）: textTool（T）でキャンバスクリック→その場にインライン入力（HTML input を worldToScreen 位置にオーバーレイ）→`Enter` 確定 / `Esc` 破棄 / 空文字なら破棄。既存テキストはダブルクリックで再編集。
   - フィールド: `text`（複数行可・`\n` 区切り）、`fontSize`（world m。default 100、パネルで 10〜10000）、`orientation`（h/v。v は1文字ずつ縦積み）、`styleOverride.color`（default `#333333`）、`layerId` default `annotation`。
   - レンダリング: Pixi Text。フォントは `"Noto Sans JP", sans-serif`（web は Google Fonts self-host ではなく system-ui フォールバック付き CSS 指定。SVG 出力も同じ font-family 文字列）。白縁取り halo（§3.5）。world 固定サイズ（ズーム追従）。アンカーは `pt` を中心とする。
   - 選択・移動・削除・コピペは M5 の機構がそのまま効く（hitTest は計測 bbox。Pixi Text の `getLocalBounds` を world 換算してキャッシュ）。
2. **付随ラベル**（既存オブジェクトの `name` + `showLabel`）:
   - point: 記号の右に水平表示（オフセット `size*0.7` px 相当）。fontSize はスクリーン固定 12px（記号と同様のスケール補正）。
   - area / admin: `polygonCentroid` に中央揃え。fontSize は world 換算で「エリア bbox 幅の 1/10、ただし 40m〜400m にクランプ」。
   - line: 密化後点列の中点に水平表示（回転なし。沿線回転は将来）。
   - ラベルは親オブジェクトの Container 内に描く（選択・移動が親と一体）。
3. PropertiesPanel: text オブジェクト用の編集欄（textarea / fontSize / orientation / color）、一般オブジェクトの name + showLabel トグル（M5 で枠だけ用意した箇所を実装）。

**DoD**:
- [ ] テキストの配置・再編集・縦書き・移動・削除・Undo が動く
- [ ] point/area/line の付随ラベルが仕様の位置・サイズで出る
- [ ] ズームしてもテキストが world 追従（自由配置）/スクリーン固定（point ラベル）で仕様どおり
- [ ] `pnpm check` 緑

**検証手順**: M5 の地図に地名・川名・駅名を配置したスクリーンショット（ズーム2段階）。

---

### M7 — リアルタイム同期（Yjs + Durable Objects）

**目的**: 複数クライアントの同時編集・プレゼンス・永続化。**このマイルストーン以降、地図データの保存先は DO のみ**（それ以前のローカル doc はページリロードで消えてよい、が正式仕様）。
**依存**: M2 + M5。仕様の前提は §4。

**対象**: `apps/worker/src/rooms/MapRoom.ts` / `routes/maps.ts`（ws・seed・purge）、`editor/doc/provider.ts` / `doc/awareness.ts`、`canvas/overlay.ts`（リモートカーソル）、TopBar（接続状態・アバター列）、EditorPage の結線。

**仕様**:

1. **MapRoom DO**: §4.3 を完全実装。追加詳細:
   - `fetch()` は `Upgrade: websocket` のみ受理。role は Worker が付与するヘッダ `x-map-role: view|edit|owner` から取得し attachment に保存。
   - broadcast は `this.ctx.getWebSockets()` で全列挙し送信元除外。送信失敗（CLOSED）は無視。
   - 圧縮（>200 行で mergeUpdates）は update 受信処理の末尾で同期実行（行数 COUNT が安い）。
   - awareness メッセージは保存せず中継のみ。クライアント切断時（`webSocketClose`）は何もしない（awareness のタイムアウト 30s はクライアント側 y-protocols が処理）。
   - `seed(update)`: `updates` が 0 行のときのみ INSERT。冪等。
   - `purge()`: DELETE 全行 + 全ソケット close(1000)。
2. **Worker ルート**: `GET /api/maps/:id/ws?t=` — `resolveRole` で 403/404 を先に返し、OK なら `MAP_ROOM.idFromName(mapId)` の stub へ `fetch` 転送（role ヘッダ付与）。`POST /api/maps` に seed 実装（Worker 内で一時 Y.Doc → デフォルトレイヤー7つ＋meta → `encodeStateAsUpdate` → `stub.seed()`）。`DELETE` に `purge()` 結線。
3. **クライアント provider**: §4.4。`MapDoc` は provider の有無に依存しない（M3 の設計確認）。EditorPage: mount 時に `GET /api/maps/:id`（403→エラーページ）→ MapDoc 生成 → provider 接続 → 初回 sync 完了イベントまでローディング表示。`seedLocalDefaults` は削除（seed はサーバー責務に移行）。
4. **awareness UI**: 他ユーザーのカーソル（色付きポインタ＋名前タグ、200ms 補間）と選択オブジェクトの色付き薄枠を overlay に表示。TopBar に接続中ユーザーのアバター列（頭文字サークル、色は §4.4）と接続状態（connected=非表示 / connecting・offline=バナー「再接続中…」）。
5. **readonly 強制**: サーバー側は §4.2（view の sync-update 破棄）。クライアント側は role=view のとき全編集ツールを無効化し閲覧 UI に（M8 で仕上げるが、機構はここで入れる）。
6. 自動保存 UI は不要になる（常時同期）。TopBar の保存状態表示は「同期済み/同期中/オフライン」に置換。

**DoD**:
- [ ] ブラウザ2窓（同一マップ）で描画・移動・プロパティ変更が相互に ~100ms で反映
- [ ] 片方のカーソル・選択が他方に色付きで見える
- [ ] `wrangler dev` 再起動（--local の DO storage 永続）またはページリロード後もデータが残る
- [ ] 片方をオフライン化（devtools）→ 編集 → 復帰で自動送達・収束（両窓の最終状態一致）
- [ ] Undo が「自分の変更のみ」対象（相手の編集を巻き戻さない）ことを2窓で確認
- [ ] `pnpm check` 緑

**検証手順**: 上記を2窓（片方シークレットウィンドウ＋別 Google アカウント or x-e2e-user）で実施し、各項目の結果を記録。DO SQLite の行数と圧縮動作をログで確認（201 update 投入で 1 行に縮むこと）。

---

### M8 — 共有（リンク発行・閲覧専用）

**目的**: 「リンクを渡せば見せられる/一緒に編集できる」を完成させる。
**依存**: M7。

**対象**: `apps/worker/src/routes/links.ts` / `share.ts`、`middleware/session.ts`（resolveRole の link 対応）、`editor/ui/ShareDialog.tsx`、`app/router.tsx`（`/s/:token`）、閲覧専用モード仕上げ。

**仕様**:

1. **API**: §2.5 の links 3本＋share 1本。token は `crypto.getRandomValues(new Uint8Array(24))` → base64url（32文字）。
2. **resolveRole 拡張**: `?t=` の token を map_links で検証（`revoked_at IS NULL` かつ map_id 一致）。owner には token 不要。**edit リンク越しでも PATCH/DELETE /api/maps/:id（メタ操作）は owner 限定のまま**。
3. **ShareDialog**（TopBar「共有」）: 閲覧リンク/編集リンクそれぞれ「発行（既存が有効ならそれを表示）・コピー・失効」。URL 形式 `https://<host>/s/<token>`。失効の confirm には「このリンクを知っている人はアクセスできなくなります」。オーナー以外にはダイアログ自体を出さない。
4. **`/s/:token` ルート**: ログインへ誘導（未ログイン時。ログイン後に戻す `redirect` パラメータ）→ `GET /api/share/:token` → `sessionStorage` に `{mapId: token}` を保存して `/edit/:mapId` へ。EditorPage は sessionStorage の token を WS とメタ取得に付与。失効済み token は「リンクが無効です」ページ。
5. **閲覧専用モード**（role=view）: ToolBar は選択ツールのみ（プロパティは読み取り表示）、編集系ショートカット無効、TopBar に「閲覧専用」バッジ。ビュー操作・エクスポート（M9）は許可。
6. **失効の即時性**: 失効 API 成功時、Worker から DO へ `closeByRole?` は実装しない（v2.0 は次回接続時に拒否されれば十分）。接続中クライアントが残る件は既知の制限として v2-decisions.md に記録。

**DoD**:
- [ ] 編集リンクで別アカウントが参加し同時編集できる／閲覧リンクは見えるが一切編集できない（UI・サーバー両方で確認: devtools から直接 WS update を送っても反映されない）
- [ ] 失効後の新規アクセスが 404 になる
- [ ] `pnpm check` 緑

**検証手順**: アカウントA でリンク発行 → B（シークレット窓）で編集参加・閲覧参加をそれぞれ確認。閲覧側でコンソールから update 送信を試み、サーバー側破棄をログで確認。

---

### M9 — エクスポート（PNG / SVG / .fmap）＋サムネイル

**目的**: 作った地図を外へ出せる。
**依存**: M5（SVG ライター単体は M1 完了後から並行可）。

**対象**: `apps/web/src/export/{exportPng.ts,svgWriter.ts,exportFmap.ts,ExportDialog.tsx}`、`apps/worker/src/routes/thumbnails.ts`、Dashboard のインポート導線。

**仕様**:

1. **ExportDialog**（TopBar「エクスポート ▾」）: 形式（PNG/SVG/.fmap）、範囲（現在のビュー / 全オブジェクト＋余白5%）、PNG のみ倍率（1x/2x/4x、上限 8192px 辺）。ファイル名は `マップ名.拡張子`（禁則文字置換）。
2. **PNG**: grid/overlay/preview を一時非表示 → 範囲 bbox から `RenderTexture`（サイズ=bbox×倍率）に worldRoot を描画 → `renderer.extract.image()` → download。背景は紙色 `#f7f5f0` で塗る。処理後に表示状態を復元。
3. **SVG ライター**（`svgWriter.ts`。**Pixi 非依存の純関数**）: `exportSvg(objects, layers, catalog, opts: {bbox, pxPerMeter}): string`。
   - ルート: `viewBox="minX minY w h"`（world m 単位）、`width/height` は px 換算。背景 rect。
   - z 昇順に出力。line=`<polyline>`（curve は密化後）、破線は `stroke-dasharray`、casing は2本目の polyline、枕木・パターンは shared の同一関数から `<line>`/`<pattern>` 生成、area=`<polygon>`＋pattern fill、point=`<use href="#sym-…">`（`<defs>` に SYMBOL_PATHS から生成、`transform` で位置・サイズ。**エクスポート時の記号サイズは `size / opts.pxPerMeter` の world 換算で固定**＝画面の見た目と一致）、text=`<text>`（`paint-order="stroke"` の白縁、縦書きは `writing-mode="vertical-rl"`）。
   - 非表示（オブジェクト/レイヤー）は出力しない。minS/maxS は**現在の縮尺**で判定（opts に vt.s を渡す）。
   - ユニットテスト: 代表オブジェクト各種 → スナップショットテスト＋「well-formed XML であること」。
4. **.fmap**:
   ```json
   { "format": "fmap", "version": 2, "exportedAt": "<ISO8601>", "name": "<マップ名>",
     "layers": [Layer...], "layerOrder": ["id"...], "objects": [MapObject...] }
   ```
   エクスポートは Y.Doc スナップショットから生成。**インポート**は Dashboard の「.fmap をインポート」: `parseFmap` で検証 → `POST /api/maps {name}` → `/edit/:id` へ遷移 → 初回 sync 完了後に1トランザクションで layers/layerOrder 置換＋objects 全挿入（ID は新規採番し直す）。検証エラーはファイル名と原因を表示。
5. **サムネイル**: エディタで「最後の編集から 30 秒後」または beforeunload 時に、PNG パイプライン（全オブジェクト範囲、長辺 640px）で生成し `POST /api/maps/:id/thumbnail`。worker は R2 put + D1 `thumbnail_key`/`updated_at` 更新。Dashboard は `GET /api/thumbnails/:mapId` を img src に。

**DoD**:
- [ ] PNG/SVG/.fmap の3形式がダウンロードでき、SVG はブラウザ単体表示で Pixi 描画と同等の見た目（記号・破線・枕木・パターン・ラベル一致を目視）
- [ ] .fmap エクスポート→インポートの roundtrip で同一の見た目・オブジェクト数
- [ ] ダッシュボードにサムネイルが出る
- [ ] svgWriter / fmap のテスト緑、`pnpm check` 緑

**検証手順**: M6 の地図で3形式を出力。SVG をブラウザで開いたスクリーンショットと Pixi 画面の比較画像。roundtrip 後のオブジェクト数一致をコンソールで確認。

---

### M10 — 品質・リリース

**目的**: E2E・性能の裏付けを取り、本番公開し、v1 の残骸を清算する。
**依存**: 全マイルストーン。

**対象**: `e2e/`（Playwright）、性能シード、`wrangler` 本番設定、`CLAUDE.md`、旧環境の廃止。

**仕様**:

1. **Playwright E2E**（`pnpm e2e`。ローカル wrangler + vite build 済みアセットに対し、`x-e2e-user` で認証）:
   - シナリオ①: ログイン→マップ作成→線を描く→リロード→残っている
   - シナリオ②: 2コンテキスト同時編集（A が描く→B に現れる）
   - シナリオ③: 閲覧リンクで参加→編集 UI が無効
   - シナリオ④: .fmap エクスポート→ダウンロード検証→インポート→オブジェクト数一致
2. **性能**: dev シードを拡張し 5,000 オブジェクト（線 2,000/エリア 1,500/記号 1,000/テキスト 500、座標は 50km 四方に分布）を投入。計測: ①初期表示 < 3s ②連続パン・ズーム中 55fps 以上（Chrome devtools Performance で計測、平均フレーム時間 < 18ms）③1オブジェクト編集の再描画 < 5ms。未達なら §3.3 のカリング/キャッシュを調整（対策と結果を v2-decisions.md へ）。
3. **本番デプロイ**:
   - `wrangler d1 create` / `r2 bucket create`（M0 で未済なら）＋ `pnpm db:migrate:remote`
   - `wrangler secret put` ×3（BETTER_AUTH_SECRET / GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET）。**E2E_TEST_MODE が本番 vars に無いことを確認**（チェックリスト項目）
   - `pnpm build && wrangler deploy`（apps/worker から。assets = web/dist）
   - 本番 URL で Google ログイン（リダイレクト URI を GCP に追加済みであること=ユーザータスク）→スモーク（作成・描画・2窓同期・共有・エクスポート）
4. **v1 清算**: `apps/web/.env.local`・`apps/api/.dev.vars`（旧）を削除、`SETUP.md` を v2 手順に書き換え or 削除、**Supabase プロジェクトの削除はユーザーに依頼**（agent は削除しない。依頼文をレポートに含める）。
5. **CLAUDE.md 全面更新**: v2 のスタック・構成・コマンド・設計注意点（§3.1 の Pixi v8 作法、§4 の同期設計、E2E_TEST_MODE の扱い）に書き換え。docs 参照先を v2-plan / v2-implementation に。

**DoD**:
- [ ] E2E 4シナリオ緑（CI 相当としてローカル実行記録）
- [ ] 性能3指標の計測値が基準内（計測方法と数値を報告）
- [ ] 本番 URL でスモーク一式成功（URL とスクリーンショット）
- [ ] CLAUDE.md / SETUP 更新済み、旧 env 削除済み、Supabase 削除依頼をユーザーへ提示

**検証手順**: `pnpm e2e` 出力、性能計測値、本番スモークの記録を最終報告にまとめる。

---

## 7. 完了の定義（v2.0 リリース）

M0〜M10 の全 DoD が満たされ、本番 URL で「ログイン→マップ作成→描画・編集→リンク共有→2人同時編集→PNG/SVG/.fmap エクスポート」が通しで動くこと。
