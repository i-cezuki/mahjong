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
npm run test:db    # RLSとDB関数のテスト（ローカルのSupabaseが必要）
npm run test:play  # APIとRealtimeを通して3人で1半荘を進める（下記）
```

## 構成

- `src/engine/`：UI、DB、通信に依存しないゲームのロジック。
- `src/server/`：DBアクセス、認証確認、操作の受付、画面データの生成。`table.ts` がクライアントに送る内容を1か所で作る。
- `src/app/api/`：ルームと対局のAPI。一覧は仕様書の Realtime Protocol を参照。
- `src/app/`：画面。対局の画面は `src/app/games/[id]/` にあり、`game-client.tsx` が通信、`table/` が卓の部品、`logic/` が画面に依存しない判断（席の並び、操作の整理、サイコロの再生手順）。
- `public/tiles/`：牌の画像。麻雀王国の麻雀素材（<https://mj-king.net/sozai/> の牌画2）と、それを加工して作った赤5、金5、ポッチ、逆ポッチ、花牌。作り直すときは `node scripts/make-tiles.mjs`。

### 卓の見た目を確かめる

`npm run dev` を起動して <http://localhost:3000/dev/table> を開く。ログインもSupabaseも要らない。エンジンをブラウザで動かし、自分以外の2人は自動で打つ。画面の上のボタンで、局や半荘の終わりまで進めたり、聴牌の配牌やサイコロチャンスを出したりできる。本番では開けない。

### 通しの確認

ローカルのSupabaseと開発サーバーを起動した状態で実行する。テスト用のユーザーを4人作り、ルームの作成から参加、1半荘、再戦までをAPIとRealtimeだけで進めて、不正な要求が拒否されることと応答時間を確かめる。終わったらユーザーとルームを消す。本番のSupabaseに向けては実行できない。

```bash
npx supabase start
npm run dev
npm run test:play
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

### Vercel にデプロイする

1. [Vercel](https://vercel.com) でこのリポジトリを取り込む（Hobby プラン）。設定は既定のままでよい。
2. Settings > Environment Variables に、`.env.example` の4つを本番のSupabaseの値で入れる。
3. Settings > Functions > Function Region を、Supabaseのプロジェクトと同じ地域にする（東京なら `hnd1`）。離れていると、操作のたびにDBとの往復で数百ミリ秒かかる。
4. デプロイしたら、SupabaseのURL設定（上の手順5）に本番のドメインが入っていることを確かめる。
5. スキーマを変えたあとは `npx supabase db push` を忘れずに行う。

`ADMIN_EMAIL` のGoogleアカウントでログインすると管理者になり、`/admin` でほかの人を承認できる。
