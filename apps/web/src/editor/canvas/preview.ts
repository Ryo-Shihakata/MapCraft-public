// 描画プレビュー・スナップインジケータの描画（実装書 §3.3・§3.7・§M4-3/4）。
// previewLayer（world 空間・worldRoot 配下）に確定分＋カーソルまでのラバーバンドを、
// overlayLayer（screen 空間）にスナップインジケータ（頂点=赤丸/グリッド=十字/角度=補助線）を描く。
// 純粋関数: PixiApp から呼ばれ、tools/ からの入力（drawing・snap 結果）をそのまま描画する。
import { Container, Graphics } from "pixi.js";
import type { CatalogItem, Point, ViewTransform } from "@mapcraft/shared";
import { dashSegments, maybeSmooth, worldToScreen } from "@mapcraft/shared";
import type { SnapResult } from "../tools/snap.js";

const VERTEX_RADIUS_PX = 4;
const SNAP_INDICATOR_PX = 5;

export function renderDrawPreview(
  container: Container,
  drawing: { pts: Point[]; mode: "straight" | "curve" } | null,
  item: CatalogItem | undefined,
  cursor: Point,
  vtS: number
): void {
  for (const c of container.removeChildren()) c.destroy();
  if (!item) return;

  const vr = VERTEX_RADIUS_PX / vtS;
  const g = new Graphics();

  if (item.geom === "point") {
    g.circle(cursor.x, cursor.y, vr * 1.5).fill({ color: item.style.color ?? "#000000", alpha: 0.5 });
    container.addChild(g);
    return;
  }

  if (item.geom === "rect") {
    if (!drawing || drawing.pts.length < 2) return;
    const [a, b] = drawing.pts;
    if (!a || !b) return;
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    g.rect(x, y, w, h);
    if (item.style.fill) g.fill({ color: item.style.fill, alpha: 0.35 });
    g.stroke({ width: Math.max(1, item.style.sw ?? 1) / vtS, color: item.style.stroke ?? "#333333", alpha: 0.9 });
    container.addChild(g);
    return;
  }

  // line / area / admin: 確定分 + カーソルまでのラバーバンド
  const confirmed = drawing?.pts ?? [];
  const mode = drawing?.mode ?? "straight";
  const live = [...confirmed, cursor];
  const shown = maybeSmooth(live, item.geom, mode);

  if (shown.length >= 2) {
    g.moveTo(shown[0]!.x, shown[0]!.y);
    for (let i = 1; i < shown.length; i++) g.lineTo(shown[i]!.x, shown[i]!.y);
    g.stroke({
      width: Math.max(1, item.style.w ?? item.style.sw ?? 2) / vtS,
      color: item.style.stroke ?? item.style.fill ?? "#333333",
      alpha: 0.85,
      cap: "round",
      join: "round",
    });
  }

  // area/admin: 始点へ戻る破線ガイド（閉路になることを示す）
  if (item.geom !== "line" && confirmed.length >= 2) {
    const dash = 6 / vtS;
    for (const seg of dashSegments([cursor, confirmed[0]!], [dash, dash])) {
      if (seg.length < 2) continue;
      g.moveTo(seg[0]!.x, seg[0]!.y);
      for (let i = 1; i < seg.length; i++) g.lineTo(seg[i]!.x, seg[i]!.y);
      g.stroke({ width: 1 / vtS, color: item.style.stroke ?? "#333333", alpha: 0.5 });
    }
  }

  for (const p of confirmed) {
    g.circle(p.x, p.y, vr).fill({ color: "#ffffff" }).stroke({ width: 1 / vtS, color: "#333333" });
  }
  g.circle(cursor.x, cursor.y, vr * 0.8).fill({ color: "#ff3333", alpha: 0.9 });

  container.addChild(g);
}

// overlayLayer は選択オーバーレイ（overlay.ts）と共有するため、ここではクリアしない
// （呼び出し元 PixiApp.renderOverlayLayer が renderOverlay() で一度だけクリアする）。
export function renderSnapIndicator(container: Container, snap: SnapResult, vt: ViewTransform): void {
  if (snap.kind === null) return;

  const s = worldToScreen(snap.pt.x, snap.pt.y, vt);
  const g = new Graphics();

  switch (snap.kind) {
    case "vertex":
      g.circle(s.x, s.y, SNAP_INDICATOR_PX).fill({ color: 0xdd2222 });
      break;
    case "segment":
      g.circle(s.x, s.y, SNAP_INDICATOR_PX).stroke({ width: 2, color: 0xdd2222 });
      break;
    case "grid":
      g.moveTo(s.x - SNAP_INDICATOR_PX, s.y)
        .lineTo(s.x + SNAP_INDICATOR_PX, s.y)
        .stroke({ width: 1.5, color: 0x333333 });
      g.moveTo(s.x, s.y - SNAP_INDICATOR_PX)
        .lineTo(s.x, s.y + SNAP_INDICATOR_PX)
        .stroke({ width: 1.5, color: 0x333333 });
      break;
    case "angle":
      g.circle(s.x, s.y, SNAP_INDICATOR_PX * 0.8).fill({ color: 0x2266dd, alpha: 0.8 });
      break;
  }

  container.addChild(g);
}
