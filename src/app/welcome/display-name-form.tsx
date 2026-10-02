"use client";

import { useActionState } from "react";
import { saveDisplayName } from "@/app/actions";
import { buttonClass } from "@/components/screen";

export function DisplayNameForm({ maxLength }: { maxLength: number }) {
  const [state, action, pending] = useActionState(saveDisplayName, {
    error: null,
    value: "",
  });

  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        表示名（{maxLength}文字まで）
        <input
          name="displayName"
          required
          maxLength={maxLength}
          defaultValue={state.value}
          autoComplete="nickname"
          className="rounded border border-foreground/40 bg-transparent px-3 py-2 text-base"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-red-300">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "保存中…" : "決定"}
      </button>
    </form>
  );
}
