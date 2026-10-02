/** サーバーと画面で共有する時間の定数。単位はミリ秒。 */

/** 手番の基本の時間。これを超えた分だけ持ち時間が減る */
export const TURN_BASE_MS = 5_000;
/** 局ごとの持ち時間。局が変わると戻る */
export const BANK_MS = 20_000;
/** 他家の打牌への応答 */
export const RESPONSE_MS = 15_000;
/** サイコロの出目の指定 */
export const DICE_CHOICE_MS = 20_000;
/** 局の結果の表示 */
export const RESULT_MS = 15_000;
/** 対局の最初の手番に足す時間（ルームから卓の画面へ移る分） */
export const FIRST_TURN_GRACE_MS = 10_000;

/** サイコロが転がっている時間 */
export const DICE_ROLL_MS = 1_200;
/** 止まった出目と当たり外れを見せる時間 */
export const DICE_SHOW_MS = 1_000;
/** サイコロ1振りの演出の長さ。演出のあとの期限に足す */
export const DICE_STEP_MS = DICE_ROLL_MS + DICE_SHOW_MS;
