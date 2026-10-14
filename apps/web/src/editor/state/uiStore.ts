// UI 状態のみを持つ Zustand ストア（実装書 §3.10）。地図データは MapDoc、
// ビューポートは viewStore が持つ。ツール本体の挙動（描画・選択）は M4/M5 で実装する。
import { create } from "zustand";
import type { MapRole, Point } from "@mapcraft/shared";
import type { ConnectionStatus } from "../doc/provider.js";
import type { RemoteAwarenessEntry } from "../doc/awareness.js";

export type Tool = "select" | "draw" | "text" | "pan";

export interface SnapConfig {
  vertex: boolean;
  grid: boolean;
  angle: boolean;
  angleDeg: number;
}

// textTool のインライン編集セッション（実装書 §M6-1）。objectId が null なら新規作成、
// 非 null なら既存テキストの再編集（ダブルクリックで開始）。pt は world 座標のアンカー
// （HTML input のオーバーレイ位置計算に editor/ui/TextEditOverlay.tsx が使う）。
export interface TextEditSession {
  objectId: string | null;
  pt: Point;
  text: string;
}

interface UIState {
  tool: Tool;
  activeItemId: string | null;
  selectedIds: string[];
  editingVertex: { objectId: string; index: number } | null;
  drawing: { pts: Point[]; mode: "straight" | "curve" } | null;
  snapConfig: SnapConfig;
  cursorWorld: Point | null;
  panels: { catalog: boolean };
  // 一時的なステータスバー通知（例: ロック中レイヤーへの描画確定拒否）。M4 で追加。
  statusMessage: string | null;
  // M6: テキストツールのインライン入力セッション。非 null の間は TextEditOverlay を表示し、
  // ToolManager はキャンバス操作（パン・選択・描画）を一時停止する。
  textEdit: TextEditSession | null;

  // M7: リアルタイム同期。role は resolveRole の結果（view のとき ToolManager が
  // 編集系操作をブロックする。§M7-5）。connectionStatus/remoteAwareness は
  // MapProvider のコールバックから更新される（TopBar のバナー・アバター列・
  // overlay のリモートカーソル描画が参照する）。/dev/editor（provider 無し）では
  // 既定値のまま（role: owner・connected）で編集を妨げない。
  role: MapRole;
  connectionStatus: ConnectionStatus;
  remoteAwareness: RemoteAwarenessEntry[];

  setTool: (tool: Tool) => void;
  setActiveItemId: (id: string | null) => void;
  setSelectedIds: (ids: string[]) => void;
  setEditingVertex: (v: { objectId: string; index: number } | null) => void;
  setDrawing: (d: { pts: Point[]; mode: "straight" | "curve" } | null) => void;
  setSnapConfig: (cfg: Partial<SnapConfig>) => void;
  setCursorWorld: (p: Point | null) => void;
  toggleCatalogPanel: () => void;
  setStatusMessage: (msg: string | null) => void;
  setTextEdit: (session: TextEditSession | null) => void;
  setRole: (role: MapRole) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setRemoteAwareness: (entries: RemoteAwarenessEntry[]) => void;
}

export const useUIStore = create<UIState>((set) => ({
  tool: "select",
  activeItemId: null,
  selectedIds: [],
  editingVertex: null,
  drawing: null,
  snapConfig: { vertex: true, grid: true, angle: true, angleDeg: 45 },
  cursorWorld: null,
  panels: { catalog: false },
  statusMessage: null,
  textEdit: null,
  role: "owner",
  connectionStatus: "connected",
  remoteAwareness: [],

  setTool: (tool) => set({ tool, drawing: null }),
  setActiveItemId: (id) => set({ activeItemId: id }),
  setSelectedIds: (ids) => set({ selectedIds: ids }),
  setEditingVertex: (v) => set({ editingVertex: v }),
  setDrawing: (d) => set({ drawing: d }),
  setSnapConfig: (cfg) => set(({ snapConfig }) => ({ snapConfig: { ...snapConfig, ...cfg } })),
  setCursorWorld: (p) => set({ cursorWorld: p }),
  toggleCatalogPanel: () => set(({ panels }) => ({ panels: { ...panels, catalog: !panels.catalog } })),
  setStatusMessage: (msg) => set({ statusMessage: msg }),
  setTextEdit: (session) => set({ textEdit: session }),
  setRole: (role) => set({ role }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setRemoteAwareness: (entries) => set({ remoteAwareness: entries }),
}));
