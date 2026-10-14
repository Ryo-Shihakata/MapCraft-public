// ShareDialog（実装書 §M8-3）: TopBar「共有」から開く。閲覧/編集リンクそれぞれ「発行（既存が
// 有効ならそれを表示）・コピー・失効」。オーナー以外にはこのダイアログ自体を出さない（呼び出し側=TopBar）。
import { useEffect, useState } from "react";
import type { LinkRole } from "@mapcraft/shared";
import { api, ApiError, type LinkInfo } from "../../lib/api.js";

interface ShareDialogProps {
  mapId: string;
  onClose: () => void;
}

function shareUrl(token: string): string {
  return `${window.location.origin}/s/${token}`;
}

const ROLE_LABEL: Record<LinkRole, string> = { view: "閲覧リンク", edit: "編集リンク" };
const ROLES: LinkRole[] = ["view", "edit"];

function RoleSection({
  role,
  link,
  issuing,
  copied,
  onIssue,
  onCopy,
  onRevoke,
}: {
  role: LinkRole;
  link: LinkInfo | null;
  issuing: boolean;
  copied: boolean;
  onIssue: () => void;
  onCopy: () => void;
  onRevoke: () => void;
}) {
  return (
    <div className="mb-3 rounded border border-neutral-200 p-3 last:mb-0">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-700">{ROLE_LABEL[role]}</span>
        {!link && (
          <button
            type="button"
            onClick={onIssue}
            disabled={issuing}
            className="rounded bg-neutral-800 px-2 py-1 text-xs text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {issuing ? "発行中…" : "発行"}
          </button>
        )}
      </div>
      {link && (
        <div className="flex items-center gap-1.5">
          <input
            readOnly
            value={shareUrl(link.token)}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 rounded border border-neutral-300 px-2 py-1 text-[11px] text-neutral-600"
          />
          <button
            type="button"
            onClick={onCopy}
            className="shrink-0 rounded border border-neutral-300 px-2 py-1 text-[11px] hover:bg-neutral-50"
          >
            {copied ? "コピー済み" : "コピー"}
          </button>
          <button
            type="button"
            onClick={onRevoke}
            className="shrink-0 rounded border border-red-200 px-2 py-1 text-[11px] text-red-600 hover:bg-red-50"
          >
            失効
          </button>
        </div>
      )}
    </div>
  );
}

export function ShareDialog({ mapId, onClose }: ShareDialogProps) {
  const [links, setLinks] = useState<LinkInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issuingRole, setIssuingRole] = useState<LinkRole | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const reload = () => {
    api
      .listLinks(mapId)
      .then(setLinks)
      .catch((e) => setError(e instanceof ApiError ? e.message : "リンクの取得に失敗しました"));
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 初回のみ。以降は issue/revoke 後に手動 reload する
  }, [mapId]);

  const activeLinkFor = (role: LinkRole): LinkInfo | null =>
    links?.find((l) => l.role === role && l.revokedAt === null) ?? null;

  const handleIssue = async (role: LinkRole) => {
    setIssuingRole(role);
    setError(null);
    try {
      await api.createLink(mapId, role);
      reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "リンクの発行に失敗しました");
    } finally {
      setIssuingRole(null);
    }
  };

  const handleRevoke = async (token: string) => {
    if (!window.confirm("このリンクを知っている人はアクセスできなくなります。よろしいですか？")) return;
    setError(null);
    try {
      await api.revokeLink(mapId, token);
      reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "リンクの失効に失敗しました");
    }
  };

  const handleCopy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
      setCopiedToken(token);
      window.setTimeout(() => setCopiedToken((c) => (c === token ? null : c)), 1500);
    } catch {
      // クリップボード権限が無い環境ではコピーできないだけ（URL はダイアログの入力欄に表示済み）。
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-[420px] rounded-lg bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="共有"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-800">共有</h2>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
            ✕
          </button>
        </div>

        {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

        {links === null && !error ? (
          <p className="text-xs text-neutral-400">読み込み中…</p>
        ) : (
          ROLES.map((role) => (
            <RoleSection
              key={role}
              role={role}
              link={activeLinkFor(role)}
              issuing={issuingRole === role}
              copied={copiedToken === activeLinkFor(role)?.token}
              onIssue={() => void handleIssue(role)}
              onCopy={() => {
                const link = activeLinkFor(role);
                if (link) void handleCopy(link.token);
              }}
              onRevoke={() => {
                const link = activeLinkFor(role);
                if (link) void handleRevoke(link.token);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
