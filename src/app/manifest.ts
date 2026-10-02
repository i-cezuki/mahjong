import type { MetadataRoute } from "next";

// ホーム画面（Mac では Dock）に追加したとき、ブラウザのタブやアドレスバーなしで開く
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "3人麻雀",
    short_name: "3人麻雀",
    description: "身内で遊ぶオンライン3人麻雀",
    start_url: "/",
    display: "standalone",
    background_color: "#050b1a",
    theme_color: "#050b1a",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
