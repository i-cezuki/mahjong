-- ロンのカットインに出す決めゼリフ。本人が設定画面で決める。null なら「ロン」と出す。
-- 書くのは今までどおりサーバーだけ（src/app/actions.ts）。読む権限は profiles の既存のものを使う。

alter table public.profiles
  add column ron_phrase text check (char_length(ron_phrase) between 1 and 8);
