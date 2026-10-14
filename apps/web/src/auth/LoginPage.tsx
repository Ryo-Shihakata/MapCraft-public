// ログインページ（§M2-5）。Google OAuth のみ。
// `?redirect=` があればログイン後そこへ戻す（§M8-4: /s/:token → 未ログイン → ここ → ログイン後に
// 元の共有リンクへ）。同一オリジンの絶対パス（"/" 始まり）のみ許可し、外部URLへのオープンリダイレクトを防ぐ。
import { Navigate, useSearchParams } from "react-router";
import { authClient } from "./authClient.js";
import { useSession } from "./useSession.js";

export function LoginPage() {
  const { data: session, isPending } = useSession();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect");
  const target = redirect && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/dashboard";

  if (!isPending && session) return <Navigate to={target} replace />;

  const signIn = () => {
    void authClient.signIn.social({ provider: "google", callbackURL: target });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-center text-2xl font-bold text-neutral-800">MapCraft</h1>
        <p className="mt-2 text-center text-sm text-neutral-500">
          架空世界の地図を描くエディタ
        </p>
        <button
          type="button"
          onClick={signIn}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
        >
          {/* Google "G" ロゴ */}
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.02.15 3.5 2.7.24.02c2.2-2 3.5-5 3.5-8.6z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.2 0 5.9-1 7.8-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-4.9l-.14.01-3.6 2.8-.05.13C3.5 21.3 7.5 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.3 14.5c-.3-.7-.4-1.5-.4-2.3 0-.8.2-1.6.4-2.3l-.01-.16-3.7-2.9-.12.06C.5 8.4 0 10.2 0 12.2s.5 3.8 1.5 5.3l3.8-3z"
            />
            <path
              fill="#EB4335"
              d="M12 4.7c2.2 0 3.7 1 4.6 1.8l3.3-3.3C17.9 1.2 15.2 0 12 0 7.5 0 3.5 2.7 1.5 6.6l3.8 3C6.2 6.8 8.9 4.7 12 4.7z"
            />
          </svg>
          Googleでログイン
        </button>
      </div>
    </div>
  );
}
