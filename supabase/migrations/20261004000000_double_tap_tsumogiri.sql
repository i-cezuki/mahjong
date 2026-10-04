-- ダブルタップでツモ切りするか。本人が設定画面で決める。今までどおり最初は有効。
-- 書くのは今までどおりサーバーだけ（src/app/actions.ts）。読む権限は profiles の既存のものを使う。

alter table public.profiles
  add column double_tap_tsumogiri boolean not null default true;
