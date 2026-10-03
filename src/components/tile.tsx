import Image from "next/image";
import type { TileId } from "@/engine/tiles";
import { tileLabel } from "./labels";
import { TILE_RATIO, tileImage } from "./tile-image";

/** 牌を置く向き。時計回りの角度。 */
export type TileRotation = 0 | 90 | 180 | 270;

interface BoxProps {
  /** 牌の幅（卓のレイアウト上のpx）。倒して置くときも、立てたときの幅を渡す。 */
  width: number;
  /** 90度倒して置く（リーチ宣言牌、鳴いた牌）。rotation={90} と同じ。 */
  sideways?: boolean;
  /** 牌の向き。相手の河は、その人から見た向きに回す。sideways より優先する。 */
  rotation?: TileRotation;
}

/** 牌1枚分の場所。横に倒すときは幅と高さを入れ替え、中身を回す。 */
function TileBox({
  width,
  rotation,
  className = "",
  children,
}: {
  width: number;
  rotation: TileRotation;
  className?: string;
  children: React.ReactNode;
}) {
  const height = Math.round(width * TILE_RATIO);
  const lying = rotation === 90 || rotation === 270;
  return (
    <span
      className={`relative inline-block shrink-0 ${className}`}
      style={lying ? { width: height, height: width } : { width, height }}
    >
      <span
        className="absolute top-1/2 left-1/2 block"
        style={{
          width,
          height,
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
        }}
      >
        {children}
      </span>
    </span>
  );
}

/** 表向きの牌 */
export function Tile({
  id,
  width,
  sideways = false,
  rotation = sideways ? 90 : 0,
  dimmed = false,
  raised = false,
  glow = false,
}: BoxProps & {
  id: TileId;
  /** 薄く表示する（鳴かれた牌、選べない牌） */
  dimmed?: boolean;
  /** 少し浮かせる（打牌の1回目のタップ） */
  raised?: boolean;
  /** 金色に光らせる（乗った裏ドラ） */
  glow?: boolean;
}) {
  const height = Math.round(width * TILE_RATIO);
  return (
    <TileBox
      width={width}
      rotation={rotation}
      className={`transition-transform duration-100 ${raised ? "-translate-y-3.5" : ""} ${dimmed ? "opacity-40" : ""}`}
    >
      <span
        className={`block h-full w-full rounded-[5px] bg-[#fffaf0] shadow-[0_1px_0_rgba(255,255,255,0.75)_inset,0_3px_7px_rgba(0,0,0,0.32)] ring-1 ring-slate-950/25 ${glow ? "ura-glow" : ""}`}
      >
        <Image
          src={tileImage(id)}
          alt={tileLabel(id)}
          width={width}
          height={height}
          unoptimized
          draggable={false}
          className="block h-full w-full select-none rounded-[5px] contrast-125 saturate-125"
        />
      </span>
    </TileBox>
  );
}

/** 裏向きの牌。画像は使わず、青い板を描く。 */
export function TileBack({
  width,
  sideways = false,
  rotation = sideways ? 90 : 0,
}: BoxProps) {
  return (
    <TileBox width={width} rotation={rotation}>
      <span className="block h-full w-full rounded-[5px] border border-sky-200/80 bg-[#2259cf] shadow-[0_1px_0_rgba(255,255,255,0.35)_inset,0_3px_7px_rgba(0,0,0,0.3)] ring-1 ring-slate-950/25" />
    </TileBox>
  );
}
