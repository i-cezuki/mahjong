import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { env } from "./env";

/**
 * ログイン中のユーザーとして読むクライアント。RLSが効く。
 * セッションはCookieに持つ。
 */
export async function createSessionClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    env.supabaseUrl,
    env.supabasePublishableKey,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // サーバーコンポーネントからはCookieを書けない。更新は proxy.ts が行う。
          }
        },
      },
    },
  );
}

/**
 * RLSを通さずに読み書きするクライアント。サーバー専用。
 * 呼び出す側で、必ず先に権限を確認すること。
 */
export function createAdminClient() {
  return createClient<Database>(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
