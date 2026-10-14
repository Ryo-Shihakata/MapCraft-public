// ビューポート状態（実装書 §3.6）。Zustand。UI 状態のみ、地図データは持たない。
import { create } from "zustand";
import type { BBox, ViewTransform } from "@mapcraft/shared";

export const S_MIN = 0.005;
export const S_MAX = 50;

interface ViewState {
  vt: ViewTransform;
  setVt: (vt: ViewTransform) => void;
  zoomAt: (factor: number, cx: number, cy: number) => void;
  pan: (dx: number, dy: number) => void;
  fitBounds: (bbox: BBox, viewportW: number, viewportH: number, padding?: number) => void;
  reset: (viewportW: number, viewportH: number, s?: number) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  vt: { x: 0, y: 0, s: 0.1 },

  setVt: (vt) => set({ vt }),

  // カーソル位置（screen座標 cx, cy）を不動点としてズームする。
  zoomAt: (factor, cx, cy) =>
    set(({ vt }) => {
      const newS = Math.max(S_MIN, Math.min(S_MAX, vt.s * factor));
      const ratio = newS / vt.s;
      return {
        vt: {
          s: newS,
          x: cx - ratio * (cx - vt.x),
          y: cy - ratio * (cy - vt.y),
        },
      };
    }),

  pan: (dx, dy) => set(({ vt }) => ({ vt: { ...vt, x: vt.x + dx, y: vt.y + dy } })),

  fitBounds: (bbox, viewportW, viewportH, padding = 40) =>
    set(() => {
      const w = Math.max(1e-6, bbox.maxX - bbox.minX);
      const h = Math.max(1e-6, bbox.maxY - bbox.minY);
      const sx = (viewportW - padding * 2) / w;
      const sy = (viewportH - padding * 2) / h;
      const s = Math.max(S_MIN, Math.min(S_MAX, Math.min(sx, sy)));
      const cx = (bbox.minX + bbox.maxX) / 2;
      const cy = (bbox.minY + bbox.maxY) / 2;
      return { vt: { s, x: viewportW / 2 - cx * s, y: viewportH / 2 - cy * s } };
    }),

  reset: (viewportW, viewportH, s = 0.1) =>
    set({ vt: { s, x: viewportW / 2, y: viewportH / 2 } }),
}));
