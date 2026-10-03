"use client";

import { useActionState } from "react";
import { saveRonPhrase } from "@/app/actions";
import { buttonClass } from "@/components/screen";

export function RonPhraseForm({
  initial,
  maxLength,
}: {
  initial: string;
  maxLength: number;
}) {
  const [state, action, pending] = useActionState(saveRonPhrase, {
    error: null,
    saved: false,
    value: initial,
  });

  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        ロンの決めゼリフ（{maxLength}文字まで）
        <input
          // 保存のたびに整えた値で入れ直す
          key={state.value}
          name="ronPhrase"
          maxLength={maxLength}
          defaultValue={state.value}
          placeholder="ロン"
          autoComplete="off"
          className="rounded border border-foreground/40 bg-transparent px-3 py-2 text-base"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-red-300">
          {state.error}
        </p>
      )}
      {state.saved && (
        <p role="status" className="text-sm text-emerald-300">
          保存しました
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "保存中…" : "保存"}
      </button>
    </form>
  );
}
