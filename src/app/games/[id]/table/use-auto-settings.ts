"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import type { AutoSettings } from "../logic/actions";

const OFF: AutoSettings = { autoWin: false, noCall: false };

/** 同じ対局を開いている別のタブや、このタブ自身の書き込みを知らせる */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parse(raw: string | null): AutoSettings {
  if (!raw) return OFF;
  try {
    const value = JSON.parse(raw) as Partial<AutoSettings>;
    return { autoWin: value.autoWin === true, noCall: value.noCall === true };
  } catch {
    return OFF;
  }
}

/**
 * 自動和了と鳴きなしの切り替え。局をまたいで保ち、対局ごとにブラウザへ覚えておく。
 * iPhoneで別のアプリから戻って読み込み直されても、入れたままにするため。
 * 対局のない開発用の卓では覚えない。
 */
export function useAutoSettings(
  gameId: string | undefined,
): [AutoSettings, (settings: AutoSettings) => void] {
  const key = gameId ? `auto-settings:${gameId}` : null;
  const [local, setLocal] = useState<AutoSettings>(OFF);
  // 文字列のまま読み、同じ文字列なら同じオブジェクトを返す。自動操作の待ち時間をやり直させないため
  const raw = useSyncExternalStore(
    subscribe,
    () => (key ? read(key) : null),
    () => null,
  );
  const stored = useMemo(() => parse(raw), [raw]);

  const set = useCallback(
    (settings: AutoSettings) => {
      if (!key) {
        setLocal(settings);
        return;
      }
      try {
        window.localStorage.setItem(key, JSON.stringify(settings));
      } catch {
        // 保存できないブラウザでは、この画面の間だけ保つ
        setLocal(settings);
        return;
      }
      listeners.forEach((listener) => listener());
    },
    [key],
  );

  return [key && raw !== null ? stored : local, set];
}
