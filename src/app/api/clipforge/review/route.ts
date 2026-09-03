import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { reviewScript } from "@/lib/llm";

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await req.json();
  const script = String(body.script ?? "").trim();
  if (!script) return NextResponse.json({ error: "缺脚本内容" }, { status: 400 });
  if (script.length > 5000) return NextResponse.json({ error: "脚本过长（≤5000 字）" }, { status: 400 });
  const context = String(body.context ?? "带货短视频脚本").slice(0, 500);
  return NextResponse.json(await reviewScript(script, context));
}
