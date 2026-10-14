// better-auth クライアント。API は同一オリジン相対パス（§5）なので baseURL 指定は不要。
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
