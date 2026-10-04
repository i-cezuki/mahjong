"use client";

import { useEffect, useRef } from "react";
import type { PlayerView } from "@/server/table";
import { SOUND_NAMES, detectSound } from "../logic/sounds";
import type { SoundName } from "../logic/sounds";

/**
 * 音はWeb Audioで鳴らす。iPhoneは画面に触れるまで音を出させないので、
 * 最初に触れたときに鳴らす準備をして、音のデータを読み込む。
 * 別のアプリから戻ると止められていることがあるので、触れるたびに動かし直す。
 */
let context: AudioContext | null = null;
const buffers = new Map<SoundName, AudioBuffer>();

function unlock() {
  if (!context) {
    context = new AudioContext();
    const ctx = context;
    for (const name of SOUND_NAMES) {
      fetch(`/sounds/${name}.wav`)
        .then((response) => response.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .then((buffer) => buffers.set(name, buffer))
        .catch(() => {
          // 読めなかった音は鳴らさないだけ
        });
    }
  }
  if (context.state !== "running") context.resume().catch(() => {});
}

function play(name: SoundName) {
  const buffer = buffers.get(name);
  if (!context || context.state !== "running" || !buffer) return;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start();
}

/** 画面データが更新されるたびに、打牌、リーチ、鳴き、和了の音を鳴らす。 */
export function useSounds(view: PlayerView, version: number) {
  useEffect(() => {
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
  }, []);

  // 画面を開いた時点の画面データとは比べない
  const seen = useRef({ version, view });
  useEffect(() => {
    const before = seen.current;
    if (before.version === version) return;
    seen.current = { version, view };
    const sound = detectSound(before.view, view);
    if (sound) play(sound);
  }, [version, view]);
}
