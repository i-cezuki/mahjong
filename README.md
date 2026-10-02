# 3人麻雀

身内で遊ぶオンライン3人麻雀。仕様は [docs/SPEC.md](docs/SPEC.md) を参照。

## 開発

```bash
npm install
npm run dev        # http://localhost:3000
npm run test       # テスト
npm run typecheck  # 型チェック
npm run lint       # ESLint
npm run format     # Prettier
npm run test:db    # RLSのテスト（ローカルのSupabaseが必要）
```

## Supabase

スキーマとRLSは `supabase/migrations/` にある。クライアントからは読み取りだけを許可し、書き込みはすべてサーバー（`src/server/`）が secret key で行う。

### ローカルで動かす

Docker が必要。

```bash
npx supabase start   # ローカルのSupabaseを起動（初回はイメージの取得に時間がかかる）
npx supabase status  # URLとキーを表示。.env.local に書く
npm run db:reset     # マイグレーションを最初から適用し直す
npm run db:types     # スキーマを変えたら型を作り直す
npx supabase stop
```

### 本番の準備（最初に1回）

1. [Supabase](https://supabase.com) で無料のプロジェクトを作る。
2. マイグレーションを適用する。

   ```bash
   npx supabase login
   npx supabase link --project-ref <プロジェクトのID>
   npx supabase db push
   ```

3. Google Cloud Console で OAuth クライアント（ウェブアプリケーション）を作る。承認済みのリダイレクトURIに `https://<プロジェクトのID>.supabase.co/auth/v1/callback` を入れる。
4. Supabase の Authentication > Sign In / Providers で Google を有効にし、クライアントIDとシークレットを入れる。
5. Supabase の Authentication > URL Configuration で、Site URL に本番のURLを、Redirect URLs に `http://localhost:3000/auth/callback` と `https://<本番のドメイン>/auth/callback` を入れる。
6. `.env.example` を `.env.local` にコピーして値を入れる。Vercel にも同じ4つの環境変数を設定する。

`ADMIN_EMAIL` のGoogleアカウントでログインすると管理者になり、`/admin` でほかの人を承認できる。
