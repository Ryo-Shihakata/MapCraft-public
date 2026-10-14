// overlayLayer（screen 空間）の描画。実装書 §3.5: 選択枠・頂点ハンドル・リモートカーソルを
// 描く場所。M4 でスナップインジケータ、M5 で選択枠・頂点ハンドル・ラバーバンドを追加した。
// M7 でリモートカーソル・リモート選択枠（renderRemoteAwarenessOverlay）を追加した。
// ビュー変更・選択変更・awareness 変更時にのみ再計算する契約は維持する（PixiApp から呼び出す）。
import { Container, Graphics, Text } from "pixi.js";
import type { MapObject, Point, ViewTransform } from "@mapcraft/shared";
import { worldToScreen } from "@mapcraft/shared";
import type { RemoteAwarenessEntry } from "../doc/awareness.js";
import { combinedBBox, type SelectionOverlayState } from "../tools/selectTool.js";

const HANDLE_SIZE_PX = 8;
const REMOTE_CURSOR_SIZE_PX = 12;

// overlayLayer 全体のクリア。PixiApp.renderOverlayLayer が毎回まずこれを呼び、
// 続けて renderSnapIndicator / renderSelectionOverlay を同じ container に描き足す
// （snap インジケータと選択オーバーレイは overlayLayer を共有するため、個々の
// render 関数はクリアしない）。
export function renderOverlay(container: Container): void {
  for (const c of container.removeChildren()) c.destroy();
}

export function renderSelectionOverlay(container: Container, input: SelectionOverlayState, vt: ViewTransform): void {
  const { selected, vertexEditTarget, selectedVertexIndex, rubberBand } = input;
  const g = new Graphics();

  // 個別の薄枠（複数選択時のみ）
  if (selected.length > 1) {
    for (const obj of selected) {
      const bb = combinedBBox([obj]);
      if (!bb) continue;
      const s1 = worldToScreen(bb.minX, bb.minY, vt);
      const s2 = worldToScreen(bb.maxX, bb.maxY, vt);
      g.rect(Math.min(s1.x, s2.x), Math.min(s1.y, s2.y), Math.abs(s2.x - s1.x), Math.abs(s2.y - s1.y)).stroke({
        width: 1,
        color: 0x2266dd,
        alpha: 0.35,
      });
    }
  }

  // 結合 bbox（選択があれば常に表示）
  const combined = combinedBBox(selected);
  if (combined) {
    const s1 = worldToScreen(combined.minX, combined.minY, vt);
    const s2 = worldToScreen(combined.maxX, combined.maxY, vt);
    const x = Math.min(s1.x, s2.x);
    const y = Math.min(s1.y, s2.y);
    const w = Math.abs(s2.x - s1.x);
    const h = Math.abs(s2.y - s1.y);
    g.rect(x, y, w, h).stroke({ width: 1.5, color: 0x2266dd, alpha: 0.9 });
  }

  // 頂点ハンドル（単一の line/area/admin/rect 選択時のみ）
  if (vertexEditTarget?.pts) {
    for (let i = 0; i < vertexEditTarget.pts.length; i++) {
      const p = vertexEditTarget.pts[i]!;
      const s = worldToScreen(p.x, p.y, vt);
      const selectedHandle = i === selectedVertexIndex;
      g.rect(s.x - HANDLE_SIZE_PX / 2, s.y - HANDLE_SIZE_PX / 2, HANDLE_SIZE_PX, HANDLE_SIZE_PX)
        .fill({ color: selectedHandle ? 0xff3333 : 0xffffff })
        .stroke({ width: 1.5, color: 0x2266dd });
    }
  }

  // ラバーバンド矩形
  if (rubberBand) {
    const s1 = worldToScreen(rubberBand.a.x, rubberBand.a.y, vt);
    const s2 = worldToScreen(rubberBand.b.x, rubberBand.b.y, vt);
    const x = Math.min(s1.x, s2.x);
    const y = Math.min(s1.y, s2.y);
    const w = Math.abs(s2.x - s1.x);
    const h = Math.abs(s2.y - s1.y);
    g.rect(x, y, w, h)
      .fill({ color: 0x2266dd, alpha: 0.08 })
      .stroke({ width: 1, color: 0x2266dd, alpha: 0.7 });
  }

  container.addChild(g);
}

// リモートカーソル（色付きポインタ＋名前タグ）とリモート選択の色付き薄枠を描く（実装書 §M7-4）。
// positions は PixiApp が 200ms 補間して更新する「表示用」world 座標（entry.state.cursor が
// target、こちらは current）。カーソルが未設定（null）のクライアントは選択枠のみ描く。
export function renderRemoteAwarenessOverlay(
  container: Container,
  entries: RemoteAwarenessEntry[],
  positions: Map<number, Point>,
  getObject: (id: string) => MapObject | undefined,
  vt: ViewTransform
): void {
  for (const entry of entries) {
    const { user, selection } = entry.state;
    const color = user.color;

    for (const id of selection) {
      const obj = getObject(id);
      const bb = obj ? combinedBBox([obj]) : null;
      if (!bb) continue;
      const s1 = worldToScreen(bb.minX, bb.minY, vt);
      const s2 = worldToScreen(bb.maxX, bb.maxY, vt);
      const g = new Graphics();
      g.rect(Math.min(s1.x, s2.x), Math.min(s1.y, s2.y), Math.abs(s2.x - s1.x), Math.abs(s2.y - s1.y)).stroke({
        width: 1.5,
        color,
        alpha: 0.6,
      });
      container.addChild(g);
    }

    const pos = positions.get(entry.clientId);
    if (!pos) continue;
    const s = worldToScreen(pos.x, pos.y, vt);

    const cursor = new Graphics();
    const r = REMOTE_CURSOR_SIZE_PX;
    cursor
      .moveTo(s.x, s.y)
      .lineTo(s.x + r * 0.85, s.y + r * 0.3)
      .lineTo(s.x + r * 0.4, s.y + r * 0.4)
      .lineTo(s.x + r * 0.3, s.y + r * 0.85)
      .lineTo(s.x, s.y)
      .fill({ color })
      .stroke({ width: 1, color: 0xffffff, alpha: 0.9 });
    container.addChild(cursor);

    const label = new Text({
      text: user.name,
      style: { fontSize: 11, fill: 0xffffff, fontFamily: "sans-serif" },
    });
    const tagX = s.x + r + 2;
    const tagY = s.y + 2;
    const tagBg = new Graphics();
    tagBg.roundRect(tagX, tagY, label.width + 8, label.height + 4, 3).fill({ color, alpha: 0.92 });
    container.addChild(tagBg);
    label.position.set(tagX + 4, tagY + 2);
    container.addChild(label);
  }
}
