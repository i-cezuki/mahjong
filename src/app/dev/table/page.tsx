import { notFound } from "next/navigation";
import { Sandbox } from "./sandbox";

/** 卓の見た目を確かめるための画面。開発時だけ開ける。 */
export default function SandboxPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Sandbox />;
}
