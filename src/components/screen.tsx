import type { ReactNode } from "react";

/**
 * ログインや承認待ちなど、中央に1枚のカードを置く画面の枠。
 * @param wide 表を出す画面用に、横幅を広く取る
 */
export function Screen({
  title,
  wide = false,
  children,
}: {
  title: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
      <div
        className={`flex w-full flex-col gap-5 rounded-lg border border-foreground/30 p-6 ${
          wide ? "max-w-5xl" : "max-w-sm"
        }`}
      >
        <h1 className="text-xl font-semibold tracking-wide">{title}</h1>
        {children}
      </div>
    </main>
  );
}

export const buttonClass =
  "rounded border border-foreground/60 px-4 py-2 text-sm font-medium hover:bg-foreground/10 disabled:opacity-50";

export const subtleButtonClass =
  "text-sm underline opacity-70 hover:opacity-100";
