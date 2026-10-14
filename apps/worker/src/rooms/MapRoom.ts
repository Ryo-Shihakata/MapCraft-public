// MapRoom — 1マップ=1DO のリアルタイム同期ルーム（§4.3）。
//
// 設計原則（§4.1）: この DO は Y.Doc を一切インスタンス化しない。update バイナリの
// merge/diff のみで応答する（Y.mergeUpdates / Y.encodeStateVectorFromUpdate / Y.diffUpdate）。
// これにより hibernation（WebSocket hibernation API）と両立する: DO が休止して
// メモリ上の状態を失っても、SQLite の updates テーブルから毎回再構築できる。
import { DurableObject } from "cloudflare:workers";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import type { MapRole } from "@mapcraft/shared";
import type { Env } from "../env.js";
import { computeDiff, computeMergedUpdate, computeStateVector, EMPTY_UPDATE } from "./sync.js";

// §4.2 WS メッセージ: [messageType: varUint, payload]
const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

// y-protocols/sync のサブメッセージ種別（messageType===MESSAGE_SYNC のペイロード先頭）。
const SYNC_STEP1 = 0;
const SYNC_STEP2 = 1;
const SYNC_UPDATE = 2;

// この行数を超えたら mergeUpdates で 1 行に圧縮する（§4.3）。
const COMPACT_THRESHOLD = 200;

interface WsAttachment {
  role: MapRole;
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

export class MapRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // スキーマ初期化のみ blockConcurrencyWhile 内で行う（§durable-objects best practice）。
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(
        "CREATE TABLE IF NOT EXISTS updates (id INTEGER PRIMARY KEY AUTOINCREMENT, data BLOB NOT NULL)"
      );
    });
  }

  fetch(request: Request): Response {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }

    const roleHeader = request.headers.get("x-map-role");
    const role: MapRole =
      roleHeader === "owner" || roleHeader === "edit" || roleHeader === "view" ? roleHeader : "view";

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    // hibernation API: accept 済みソケットは role をタグ兼 attachment として保持する。
    // ハンドラ（webSocketMessage/Close）は DO が休止から復帰しても同じ role で呼ばれる。
    this.ctx.acceptWebSocket(server, [role]);
    server.serializeAttachment({ role } satisfies WsAttachment);

    // 接続時ハンドシェイク（§4.2）: accept 直後にサーバー側 SyncStep1 を送る。
    this.sendSyncStep1(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  private getRole(ws: WebSocket): MapRole {
    const attachment = ws.deserializeAttachment() as WsAttachment | null;
    return attachment?.role ?? "view";
  }

  private readAllUpdateRows(): Uint8Array[] {
    const cursor = this.ctx.storage.sql.exec<{ data: ArrayBuffer }>(
      "SELECT data FROM updates ORDER BY id ASC"
    );
    return cursor.toArray().map((row) => new Uint8Array(row.data));
  }

  private getMergedUpdate(): Uint8Array | null {
    return computeMergedUpdate(this.readAllUpdateRows());
  }

  private sendSyncStep1(ws: WebSocket): void {
    const sv = computeStateVector(this.getMergedUpdate());
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    encoding.writeVarUint(encoder, SYNC_STEP1);
    encoding.writeVarUint8Array(encoder, sv);
    ws.send(encoding.toUint8Array(encoder));
  }

  private sendSyncStep2(ws: WebSocket, remoteSV: Uint8Array): void {
    const diff = computeDiff(this.getMergedUpdate(), remoteSV);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    encoding.writeVarUint(encoder, SYNC_STEP2);
    encoding.writeVarUint8Array(encoder, diff);
    ws.send(encoding.toUint8Array(encoder));
  }

  private sendReadonlyError(ws: WebSocket): void {
    ws.send(JSON.stringify({ type: "error", code: "readonly" }));
  }

  /** 送信元以外の全ソケットへ配信する。CLOSED なソケットへの送信失敗は無視する（§4.3）。 */
  private broadcast(from: WebSocket, data: ArrayBuffer | Uint8Array): void {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === from) continue;
      try {
        ws.send(data);
      } catch {
        // 送信失敗（CLOSED）は無視する。
      }
    }
  }

  private insertUpdate(update: Uint8Array): void {
    this.ctx.storage.sql.exec("INSERT INTO updates (data) VALUES (?)", toArrayBuffer(update));
  }

  /** 行数 > 200 なら mergeUpdates で 1 行に圧縮する（受信処理の末尾で同期実行）。 */
  private maybeCompact(): void {
    const { c } = this.ctx.storage.sql.exec<{ c: number }>("SELECT COUNT(*) as c FROM updates").one();
    if (c <= COMPACT_THRESHOLD) return;
    const rows = this.readAllUpdateRows();
    const merged = computeMergedUpdate(rows) ?? EMPTY_UPDATE;
    // DELETE→INSERT を await を挟まず同期的に実行する（他リクエストとのインターリーブを避ける）。
    this.ctx.storage.sql.exec("DELETE FROM updates");
    this.ctx.storage.sql.exec("INSERT INTO updates (data) VALUES (?)", toArrayBuffer(merged));
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message === "string") return; // バイナリ以外のフレームは想定外（無視）

    const decoder = decoding.createDecoder(new Uint8Array(message));
    const messageType = decoding.readVarUint(decoder);

    if (messageType === MESSAGE_AWARENESS) {
      // awareness は保存せず中継のみ。view ロールでも許可する（§4.3）。
      this.broadcast(ws, message);
      return;
    }

    if (messageType !== MESSAGE_SYNC) return;

    const syncType = decoding.readVarUint(decoder);
    if (syncType === SYNC_STEP1) {
      const remoteSV = decoding.readVarUint8Array(decoder);
      this.sendSyncStep2(ws, remoteSV);
      return;
    }

    // SyncStep2 / Update はどちらも「実 update データ」を運ぶ（§4.2）。
    const update = decoding.readVarUint8Array(decoder);

    const role = this.getRole(ws);
    if (role === "view") {
      this.sendReadonlyError(ws);
      return;
    }

    // ① updates に INSERT ② 送信元以外へブロードキャスト ③ 圧縮判定（§4.3）。
    this.insertUpdate(update);

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    encoding.writeVarUint(encoder, SYNC_UPDATE);
    encoding.writeVarUint8Array(encoder, update);
    this.broadcast(ws, encoding.toUint8Array(encoder));

    this.maybeCompact();
  }

  webSocketClose(_ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): void {
    // awareness のタイムアウト（30s）はクライアント側 y-protocols が処理するため、
    // ここでは何もしない（§4.3）。
  }

  // マップ作成時、updates が空のときだけ初期 update を格納する（冪等）。
  async seed(initialUpdate: Uint8Array): Promise<void> {
    const { c } = this.ctx.storage.sql.exec<{ c: number }>("SELECT COUNT(*) as c FROM updates").one();
    if (c > 0) return;
    if (initialUpdate.byteLength === 0) return;
    this.insertUpdate(initialUpdate);
  }

  // マップ削除時、全データを削除し全ソケットを close する。
  async purge(): Promise<void> {
    this.ctx.storage.sql.exec("DELETE FROM updates");
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(1000, "map deleted");
      } catch {
        // 既に閉じている場合は無視。
      }
    }
  }

  // DEV 限定デバッグ用: updates テーブルの現在行数（M7 DoD の圧縮検証に使用）。
  // 本番でも呼び出し自体は無害（機密情報を含まない）だが、Worker 側で E2E_TEST_MODE
  // 等のガードを掛けた上で呼ぶこと。
  async debugRowCount(): Promise<number> {
    return this.ctx.storage.sql.exec<{ c: number }>("SELECT COUNT(*) as c FROM updates").one().c;
  }
}
