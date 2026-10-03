/** 2回のタップをツモ切りとみなす間隔 */
const DOUBLE_TAP_MS = 350;

/** 2回のタップを同じ場所とみなす距離（画面のpx） */
const DOUBLE_TAP_DISTANCE = 40;

export interface Tap {
  /** タップした時刻（ミリ秒） */
  time: number;
  x: number;
  y: number;
}

/**
 * 同じ場所を素早く2回タップしたか。
 * 端末を持ち直したときに別々の指が続けて触れただけでは成立させない。
 */
export function isDoubleTap(previous: Tap | null, next: Tap): boolean {
  if (previous === null) return false;
  return (
    next.time - previous.time <= DOUBLE_TAP_MS &&
    Math.hypot(next.x - previous.x, next.y - previous.y) <= DOUBLE_TAP_DISTANCE
  );
}
