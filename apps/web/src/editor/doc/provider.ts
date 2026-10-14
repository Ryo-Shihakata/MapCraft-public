// MapProvider — MapDoc を MapRoom DO と WebSocket 経由で同期する薄いクライアント（実装書 §4.4）。
// y-websocket は使わず、y-protocols/sync + y-protocols/awareness を自前で実装する
// （ワイヤーフォーマットは §4.2: [messageType: varUint, payload]。0=sync, 1=awareness）。
//
// リモートから受信した update は MapDoc.LOCAL_ORIGIN とは別の origin で適用する。
// これにより Y.UndoManager（trackedOrigins: [LOCAL_ORIGIN]）はリモートの変更を
// 自分の Undo 対象に含めない（§M7 DoD: Undo は自分の変更のみが対象）。
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import { Awareness } from "y-protocols/awareness";
import type { MapDoc } from "./MapDoc.js";
import { LOCAL_ORIGIN } from "./MapDoc.js";
import type { AwarenessState, AwarenessUser, RemoteAwarenessEntry } from "./awareness.js";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

const MIN_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;

const REMOTE_ORIGIN = Symbol("remote");
const REMOTE_AWARENESS_ORIGIN = "remote";

export type ConnectionStatus = "connecting" | "connected" | "offline";

export interface MapProviderOptions {
  onStatusChange?: ((status: ConnectionStatus) => void) | undefined;
  // 初回 sync 完了時に1度だけ呼ばれる（EditorPage のローディング解除に使う）。
  onSynced?: (() => void) | undefined;
  onRemoteAwarenessChange?: ((entries: RemoteAwarenessEntry[]) => void) | undefined;
}

export class MapProvider {
  readonly awareness: Awareness;

  private ws: WebSocket | null = null;
  private status: ConnectionStatus = "connecting";
  private reconnectDelay = MIN_RECONNECT_DELAY_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private synced = false;

  private readonly mapDoc: MapDoc;
  private readonly wsUrl: string;
  private readonly opts: MapProviderOptions;

  constructor(mapDoc: MapDoc, wsUrl: string, opts: MapProviderOptions = {}) {
    this.mapDoc = mapDoc;
    this.wsUrl = wsUrl;
    this.opts = opts;
    this.awareness = new Awareness(mapDoc.doc);
    // ユーザー情報が setLocalUser() で設定されるまでは何も公開しない。
    this.awareness.setLocalState(null);

    this.mapDoc.doc.on("update", this.onDocUpdate);
    this.awareness.on("update", this.onAwarenessUpdate);

    this.connect();
  }

  // ── ローカル awareness の更新（EditorPage / ToolManager 側から呼ぶ） ────────

  setLocalUser(user: AwarenessUser): void {
    this.awareness.setLocalState({ user, cursor: null, selection: [] } satisfies AwarenessState);
  }

  setLocalCursor(cursor: { x: number; y: number } | null): void {
    if (this.awareness.getLocalState() === null) return; // setLocalUser 未実行
    this.awareness.setLocalStateField("cursor", cursor);
  }

  setLocalSelection(ids: string[]): void {
    if (this.awareness.getLocalState() === null) return;
    this.awareness.setLocalStateField("selection", ids);
  }

  getRemoteAwareness(): RemoteAwarenessEntry[] {
    const out: RemoteAwarenessEntry[] = [];
    this.awareness.getStates().forEach((state, clientId) => {
      if (clientId === this.awareness.clientID) return;
      if (!state || !("user" in state)) return;
      out.push({ clientId, state: state as AwarenessState });
    });
    return out;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  // ── Y.Doc update のフォワーディング ──────────────────────────────────────

  private readonly onDocUpdate = (update: Uint8Array, origin: unknown): void => {
    // ローカル編集（LOCAL_ORIGIN）だけでなく、mapDoc.undo（Y.UndoManager）が生成する
    // undo/redo のトランザクションも「このクライアントの意図した変更」としてサーバーへ
    // 送る。Y.UndoManager.undo()/redo() は内部で `doc.transact(fn, undoManager)` を呼ぶため
    // （yjs/src/utils/UndoManager.js）、origin は LOCAL_ORIGIN ではなく undoManager
    // インスタンス自身になる。ここを LOCAL_ORIGIN 限定のままにすると、Ctrl+Z/Ctrl+Shift+Z
    // がローカルの見た目だけ変えてサーバー・他クライアントに一切伝播しない不具合になる
    // （実装時に2クライアント検証で発見。§M7 DoD5 の前提）。
    // リモートから適用した update（REMOTE_ORIGIN）はここでは弾かれ、エコーバックしない。
    if (origin !== LOCAL_ORIGIN && origin !== this.mapDoc.undo) return;
    this.sendUpdate(update);
  };

  private readonly onAwarenessUpdate = (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ): void => {
    if (origin === REMOTE_AWARENESS_ORIGIN) {
      this.notifyRemoteAwareness();
      return;
    }
    const changed = changes.added.concat(changes.updated, changes.removed);
    if (changed.length > 0) this.sendAwarenessUpdate(changed);
    this.notifyRemoteAwareness();
  };

  // ── 接続管理 ──────────────────────────────────────────────────────────────

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.opts.onStatusChange?.(status);
  }

  private connect(): void {
    if (this.destroyed) return;
    this.setStatus("connecting");

    let ws: WebSocket;
    try {
      ws = new WebSocket(this.wsUrl);
    } catch {
      this.setStatus("offline");
      this.scheduleReconnect();
      return;
    }
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    ws.addEventListener("open", () => {
      if (this.ws !== ws) return;
      this.reconnectDelay = MIN_RECONNECT_DELAY_MS;
      this.setStatus("connected");

      // 接続時ハンドシェイク: クライアント側からも SyncStep1 を送る（§4.2）。
      // オフライン中に溜まったローカル編集は、これに対するサーバーの SyncStep1
      // （state vector）への応答として readSyncMessage が自動的に diff を返送する。
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeSyncStep1(encoder, this.mapDoc.doc);
      ws.send(encoding.toUint8Array(encoder));

      const localState = this.awareness.getLocalState();
      if (localState) this.sendAwarenessUpdate([this.awareness.clientID]);
    });

    ws.addEventListener("message", (ev: MessageEvent) => this.handleMessage(ev));

    ws.addEventListener("close", () => {
      if (this.ws !== ws) return;
      this.ws = null;
      const remoteIds = Array.from(this.awareness.getStates().keys()).filter(
        (id) => id !== this.awareness.clientID
      );
      if (remoteIds.length > 0) {
        awarenessProtocol.removeAwarenessStates(this.awareness, remoteIds, REMOTE_AWARENESS_ORIGIN);
      }
      this.setStatus("offline");
      this.scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      // 実際の切断処理は close イベントで行う。
    });
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer !== null) return;
    const delay = this.reconnectDelay;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
  }

  private handleMessage(ev: MessageEvent): void {
    if (typeof ev.data === "string") {
      this.handleTextMessage(ev.data);
      return;
    }
    if (!(ev.data instanceof ArrayBuffer)) return;

    const decoder = decoding.createDecoder(new Uint8Array(ev.data));
    const messageType = decoding.readVarUint(decoder);

    if (messageType === MESSAGE_AWARENESS) {
      const update = decoding.readVarUint8Array(decoder);
      awarenessProtocol.applyAwarenessUpdate(this.awareness, update, REMOTE_AWARENESS_ORIGIN);
      return;
    }
    if (messageType !== MESSAGE_SYNC) return;

    const ws = this.ws;
    if (!ws) return;

    const replyEncoder = encoding.createEncoder();
    encoding.writeVarUint(replyEncoder, MESSAGE_SYNC);
    const syncMessageType = syncProtocol.readSyncMessage(
      decoder,
      replyEncoder,
      this.mapDoc.doc,
      REMOTE_ORIGIN,
      (error) => console.error("[MapProvider] sync error", error)
    );
    if (encoding.length(replyEncoder) > 1) {
      ws.send(encoding.toUint8Array(replyEncoder));
    }
    if (syncMessageType === syncProtocol.messageYjsSyncStep2 && !this.synced) {
      this.synced = true;
      this.opts.onSynced?.();
    }
  }

  private handleTextMessage(raw: string): void {
    try {
      const msg: unknown = JSON.parse(raw);
      if (typeof msg === "object" && msg !== null && (msg as { type?: unknown }).type === "error") {
        console.warn("[MapProvider] server error", msg);
      }
    } catch {
      // 非JSONのテキストフレームは無視する。
    }
  }

  private sendUpdate(update: Uint8Array): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return; // オフライン中はローカル Y.Doc に溜まり、再接続時に自動送達される
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    ws.send(encoding.toUint8Array(encoder));
  }

  private sendAwarenessUpdate(clientIds: number[]): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, clientIds));
    ws.send(encoding.toUint8Array(encoder));
  }

  private notifyRemoteAwareness(): void {
    this.opts.onRemoteAwarenessChange?.(this.getRemoteAwareness());
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.mapDoc.doc.off("update", this.onDocUpdate);
    this.awareness.off("update", this.onAwarenessUpdate);
    this.awareness.setLocalState(null); // 他クライアントへ離脱を通知してから破棄
    this.awareness.destroy();
    this.ws?.close();
    this.ws = null;
  }
}

/** wss?://host/api/maps/:id/ws を組み立てる（実装書 §4.4。同一オリジン相対）。 */
export function buildWsUrl(mapId: string, token?: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(`/api/maps/${encodeURIComponent(mapId)}/ws`, `${protocol}//${window.location.host}`);
  if (token) url.searchParams.set("t", token);
  return url.toString();
}
