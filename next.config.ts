import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 開発サーバーに、同じLANのスマホ（http://192.168.x.x:3000）からつなげるようにする。
  // 既定では localhost 以外からの開発用の通信が止められ、画面は出るが操作が効かない。
  // 開発時だけの設定で、本番には影響しない。
  allowedDevOrigins: ["192.168.*.*"],
};

export default nextConfig;
