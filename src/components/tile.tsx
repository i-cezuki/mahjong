import Image from "next/image";
import type { TileId } from "@/engine/tiles";
import { tileLabel } from "./labels";
import { TILE_RATIO, tileImage } from "./tile-image";

interface BoxProps {
  /** 牌の幅（卓のレイアウト上のpx）。横向きでも、立てたときの幅を渡す。 */
  width: number;
  /** 90度倒して置く（リーチ宣言牌、鳴いた牌） */
  sideways?: boolean;
}

/** 牌1枚分の場所。横向きのときは幅と高さを入れ替え、中身を90度回す。 */
function TileBox({
  width,
  sideways,
  className = "",
  children,
}: BoxProps & { className?: string; children: React.ReactNode }) {
  const height = Math.round(width * TILE_RATIO);
  return (
    <span
      className={`relative inline-block shrink-0 ${className}`}
      style={sideways ? { width: height, height: width } : { width, height }}
    >
      <span
        className="absolute top-1/2 left-1/2 block"
        style={{
          width,
          height,
          transform: `translate(-50%, -50%)${sideways ? " rotate(90deg)" : ""}`,
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
  dimmed = false,
  raised = false,
}: BoxProps & {
  id: TileId;
  /** 薄く表示する（鳴かれた牌、選べない牌） */
  dimmed?: boolean;
  /** 少し浮かせる（打牌の1回目のタップ） */
  raised?: boolean;
}) {
  const height = Math.round(width * TILE_RATIO);
  return (
    <TileBox
      width={width}
      sideways={sideways}
      className={`transition-transform duration-100 ${raised ? "-translate-y-2.5" : ""} ${dimmed ? "opacity-40" : ""}`}
    >
      <Image
        src={tileImage(id)}
        alt={tileLabel(id)}
        width={width}
        height={height}
        unoptimized
        draggable={false}
        className="block h-full w-full select-none"
      />
    </TileBox>
  );
}

/** 裏向きの牌。画像は使わず、青い板を描く。 */
export function TileBack({ width, sideways = false }: BoxProps) {
  return (
    <TileBox width={width} sideways={sideways}>
      <span className="block h-full w-full rounded-[3px] border border-sky-300/70 bg-[#1f4fbf]" />
    </TileBox>
  );
}
