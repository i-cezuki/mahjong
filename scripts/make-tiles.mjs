// 牌の画像を public/tiles/ に用意する。一度実行して、できた画像をコミットしておく。
//
//   node scripts/make-tiles.mjs
//
// 素材は麻雀王国の麻雀素材「牌画2」（https://mj-king.net/sozai/）。47×63px のGIF。
// 素材に無い牌（赤5、金5、ポッチ、逆ポッチ、花牌）は、素材を加工して3倍の大きさのPNGで作る。
// sharp は next に付属しているものを使う。

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const SOURCE = "https://mj-king.net/sozai/img/pai2";
const OUT = "public/tiles";
const SCALE = 3;

/** 牌の種類 → 素材の名前。_1 が正位置の縦向き。 */
const NAMES = {
  "1m": "p_ms1",
  "9m": "p_ms9",
  ...Object.fromEntries(
    [1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((n) => [
      [`${n}p`, `p_ps${n}`],
      [`${n}s`, `p_ss${n}`],
    ]),
  ),
  "1z": "p_ji_e",
  "2z": "p_ji_s",
  "3z": "p_ji_w",
  "4z": "p_ji_n",
  "5z": "p_no",
  "6z": "p_ji_h",
  "7z": "p_ji_c",
};

async function download(kind) {
  const path = `${OUT}/${kind}.gif`;
  if (existsSync(path)) return;
  const response = await fetch(`${SOURCE}/${NAMES[kind]}_1.gif`);
  if (!response.ok)
    throw new Error(`取得できません: ${kind} ${response.status}`);
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
  console.log(`取得 ${path}`);
}

/**
 * 絵柄を1色に塗り替える。牌の面は白なので、白からの暗さをインクの濃さとみなし、
 * その濃さで白と指定の色を混ぜる。縁の影は塗り替えない。
 */
async function recolor(kind, suffix, [tr, tg, tb]) {
  const { data, info } = await sharp(`${OUT}/${kind}.gif`)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const margin = 4;
  for (let y = margin; y < height - margin - 2; y++) {
    for (let x = margin; x < width - margin - 2; x++) {
      const i = (y * width + x) * channels;
      // 素材の線は真っ黒ではないので、少し濃くして色をはっきりさせる
      const dark = 1 - Math.min(data[i], data[i + 1], data[i + 2]) / 255;
      const ink = Math.min(1, dark * 1.5);
      data[i] = Math.round(255 + (tr - 255) * ink);
      data[i + 1] = Math.round(255 + (tg - 255) * ink);
      data[i + 2] = Math.round(255 + (tb - 255) * ink);
    }
  }
  const path = `${OUT}/${kind}-${suffix}.png`;
  await sharp(data, { raw: { width, height, channels } })
    .resize(width * SCALE, height * SCALE, { kernel: "lanczos3" })
    .png()
    .toFile(path);
  console.log(`生成 ${path}`);
}

/** 白牌の上にSVGを重ねる。SVGは3倍の大きさ（141×189）の座標で書く。 */
async function overlay(name, svgBody) {
  const base = sharp(`${OUT}/5z.gif`).ensureAlpha();
  const { width, height } = await base.metadata();
  const w = width * SCALE;
  const h = height * SCALE;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${svgBody}</svg>`;
  const path = `${OUT}/${name}.png`;
  await sharp(await base.resize(w, h, { kernel: "lanczos3" }).png().toBuffer())
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toFile(path);
  console.log(`生成 ${path}`);
}

await mkdir(OUT, { recursive: true });
for (const kind of Object.keys(NAMES)) await download(kind);

const RED = [200, 16, 46];
const GOLD = [178, 130, 0];
for (const kind of ["5p", "5s"]) {
  await recolor(kind, "red", RED);
  await recolor(kind, "gold", GOLD);
}

// 面の中心は、右と下の影の分だけ左上に寄っている
const dot = (color) =>
  `<circle cx="66" cy="90" r="19" fill="${color}"/><circle cx="60" cy="84" r="6" fill="#fff" opacity="0.35"/>`;
await overlay("5z-pocchi", dot("#c8102e"));
await overlay("5z-reverse-pocchi", dot("#1e5bd8"));
await overlay(
  "1f",
  `<text x="66" y="124" font-size="96" font-weight="bold" text-anchor="middle" fill="#b0236b" font-family="Hiragino Mincho ProN, Hiragino Sans, serif">花</text>`,
);
