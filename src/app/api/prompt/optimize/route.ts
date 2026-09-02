import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { optimizePrompt } from "@/lib/llm";

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { cn, en, direction } = await req.json();
  const result = await optimizePrompt(String(cn || ""), String(en || ""), String(direction || "提升画质与细节"));
  return NextResponse.json(result);
}
