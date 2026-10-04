"use client";

import { startTransition, useActionState } from "react";
import { saveDoubleTapTsumogiri } from "@/app/actions";

/** ダブルタップでツモ切りするかの切り替え。切り替えたらすぐ保存する */
export function DoubleTapForm({ initial }: { initial: boolean }) {
  const [state, save, pending] = useActionState(saveDoubleTapTsumogiri, {
    error: null,
    enabled: initial,
  });

  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-3 text-base">
        <input
          type="checkbox"
          checked={state.enabled}
          disabled={pending}
          onChange={(event) => {
            const enabled = event.target.checked;
            startTransition(() => save(enabled));
          }}
          className="size-5"
        />
        ダブルタップでツモ切り
      </label>
      <p className="text-sm opacity-80">
        卓の手牌やボタン以外を素早く2回タップすると、ツモ牌をそのまま切ります。
      </p>
      {state.error && (
        <p role="alert" className="text-sm text-red-300">
          {state.error}
        </p>
      )}
    </div>
  );
}
