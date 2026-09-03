import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { checkCompliance } from "@/lib/compliance";

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await req.json();
  const text = String(body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "缺 text" }, { status: 400 });
  if (text.length > 5000) return NextResponse.json({ error: "文案过长（≤5000 字）" }, { status: 400 });
  return NextResponse.json(checkCompliance(text));
}
