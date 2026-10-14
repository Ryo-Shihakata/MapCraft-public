// ルーター（§M2-5, M3で /edit/:mapId を EditorPage に差し替え、/dev/* を追加、M8で /s/:token を実装）:
// /login /dashboard /edit/:mapId /s/:token (+開発専用 /dev/editor /dev/symbols)
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { LoginPage } from "../auth/LoginPage.js";
import { RequireAuth } from "../auth/RequireAuth.js";
import { DashboardPage } from "../dashboard/DashboardPage.js";
import { SymbolGallery } from "../dev/SymbolGallery.js";
import { EditorPage } from "./EditorPage.js";
import { SharePage } from "./SharePage.js";

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/edit/:mapId"
          element={
            <RequireAuth>
              <EditorPage />
            </RequireAuth>
          }
        />
        {/* 共有リンク（閲覧はログイン必須。§2.5, §M8-4） */}
        <Route path="/s/:token" element={<SharePage />} />

        {/* 開発用ルート（実装書からの逸脱を承認済み。docs/v2-decisions.md 参照）:
            /edit/:mapId は RequireAuth 配下のため、Google OAuth 無しでローカル動作を
            検証するための非認証ルート。import.meta.env.DEV のときのみ有効。 */}
        {import.meta.env.DEV && <Route path="/dev/editor" element={<EditorPage />} />}
        {import.meta.env.DEV && <Route path="/dev/symbols" element={<SymbolGallery />} />}

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
