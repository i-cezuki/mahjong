import type { MeldState, Seat, TileId } from "@/engine";

/** 副露の牌1枚の置き方 */
export interface MeldTile {
  tile: TileId;
  /** 横向き（鳴いた牌、加槓で加えた牌） */
  sideways: boolean;
  /** 裏向き（暗槓の両端） */
  back: boolean;
}

/**
 * 副露1つの牌を、卓に置く順に並べる。
 * 鳴いた牌は横向きにして、鳴いた相手の側に置く：上家（左の人）からなら左端、下家（右の人）からなら右端。
 * エンジンの並びは、ポンが [手牌, 手牌, 鳴いた牌]、大明槓が [手牌×3, 鳴いた牌]、
 * 加槓が [手牌, 手牌, 鳴いた牌, 加えた牌]。
 * @param seat 鳴いた人の席
 */
export function meldTiles(meld: MeldState, seat: Seat): MeldTile[] {
  if (meld.type === "ankan") {
    return meld.tiles.map((tile, i) => ({
      tile,
      sideways: false,
      back: i === 0 || i === 3,
    }));
  }
  const firstCalled = meld.type === "minkan" ? 3 : 2;
  const upright = meld.tiles
    .slice(0, firstCalled)
    .map((tile) => ({ tile, sideways: false, back: false }));
  const called = meld.tiles
    .slice(firstCalled)
    .map((tile) => ({ tile, sideways: true, back: false }));
  // 上家は、自分の次の次の人
  const fromLeft = meld.from === (seat + 2) % 3;
  return fromLeft ? [...called, ...upright] : [...upright, ...called];
}
