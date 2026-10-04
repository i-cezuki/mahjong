/** サーバーと画面で共有する時間の定数。単位はミリ秒。 */

/**
 * 判断1回ごとの基本の時間（手番の操作と、他家の打牌への応答）。毎回戻り、これを超えた分だけ持ち時間（長考）が減る
 */
export const BASE_MS = 5_000;
/** 局ごとの持ち時間（長考）。手番と応答で共有し、局が変わると戻る */
export const BANK_MS = 20_000;
/** 長考ボタンで足す時間。1局に1回、押した判断の間だけ使え、持ち時間より先に減る */
export const THINK_MS = 30_000;
/** サイコロの出目の指定 */
export const DICE_CHOICE_MS = 20_000;
/** 局の結果の表示 */
export const RESULT_MS = 15_000;
/** 対局の最初の手番に足す時間（ルームから卓の画面へ移る分） */
export const FIRST_TURN_GRACE_MS = 10_000;

/**
 * 打牌が通ってから次の人のツモを見せるまでに、ときどき入れる間。
 * 他家が鳴けるか和了できるときだけ応答待ちで止まるので、その待ちをこの間にまぎれさせる。
 * 間を入れる確率（%）と、入れるときの長さの範囲（この範囲でランダム）。次の人の期限にはこの分を足す。
 * 実際の応答待ちは打牌の2割ほど（ほぼポン）。頻度を上げるほど見分けにくく、テンポは落ちる。
 */
export const DRAW_HOLD_PERCENT = 10;
export const DRAW_HOLD_MIN_MS = 400;
export const DRAW_HOLD_MAX_MS = 1_600;

/** サイコロが転がっている時間 */
export const DICE_ROLL_MS = 1_200;
/** 止まった出目と当たり外れを見せる時間 */
export const DICE_SHOW_MS = 1_000;
/** サイコロ1振りの演出の長さ。演出のあとの期限に足す */
export const DICE_STEP_MS = DICE_ROLL_MS + DICE_SHOW_MS;
